import { prisma } from "@/lib/prisma";

type DeliveryAudience = "CUSTOMER" | "FUNDER" | "ADMIN";
type DeliveryChannel = "SMS" | "WHATSAPP" | "EMAIL";
type DeliverySeverity = "info" | "warning" | "critical";

type DeliveryAction = {
  label: string;
  url: string;
};

type DeliveryMeta = Record<string, unknown> & {
  type?: string;
  templateCode?: string;
  severity?: DeliverySeverity;
  actionUrl?: string;
  actionLabel?: string;
  actions?: DeliveryAction[];
};

type DeliveryPayload = {
  audience: DeliveryAudience;
  targetId: string;
  name: string;
  title: string;
  content: string;
  phone?: string | null;
  email?: string | null;
  meta?: DeliveryMeta;
};

const CHANNEL_CONFIG: Record<DeliveryChannel, string | undefined> = {
  SMS: process.env.NOTIFY_SMS_WEBHOOK_URL,
  WHATSAPP: process.env.NOTIFY_WHATSAPP_WEBHOOK_URL,
  EMAIL: process.env.NOTIFY_EMAIL_WEBHOOK_URL,
};

const CHANNEL_TOKENS: Record<DeliveryChannel, string | undefined> = {
  SMS: process.env.NOTIFY_SMS_WEBHOOK_TOKEN || process.env.NOTIFY_WEBHOOK_SHARED_TOKEN,
  WHATSAPP:
    process.env.NOTIFY_WHATSAPP_WEBHOOK_TOKEN || process.env.NOTIFY_WEBHOOK_SHARED_TOKEN,
  EMAIL: process.env.NOTIFY_EMAIL_WEBHOOK_TOKEN || process.env.NOTIFY_WEBHOOK_SHARED_TOKEN,
};

function normalizeText(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

function collapseWhitespace(value: string) {
  return normalizeText(value).replace(/\s+/g, " ");
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toPlainObject(value: Record<string, unknown> | undefined) {
  return value ? { ...value } : {};
}

function isAction(value: unknown): value is DeliveryAction {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<DeliveryAction>;
  return typeof candidate.label === "string" && typeof candidate.url === "string";
}

function extractActions(meta: DeliveryMeta | undefined): DeliveryAction[] {
  const actions: DeliveryAction[] = [];

  if (Array.isArray(meta?.actions)) {
    actions.push(...meta.actions.filter(isAction));
  }

  if (typeof meta?.actionUrl === "string" && meta.actionUrl) {
    actions.push({
      label:
        typeof meta.actionLabel === "string" && meta.actionLabel
          ? meta.actionLabel
          : "查看详情",
      url: meta.actionUrl,
    });
  }

  return actions.filter(
    (action, index, list) =>
      list.findIndex((item) => item.label === action.label && item.url === action.url) === index
  );
}

function buildEmailHtml(payload: DeliveryPayload, actions: DeliveryAction[]) {
  const title = escapeHtml(payload.title);
  const recipientName = escapeHtml(payload.name);
  const body = normalizeText(payload.content)
    .split("\n")
    .map((line) => `<p style="margin:0 0 12px;color:#334155;font-size:14px;line-height:1.7;">${escapeHtml(line)}</p>`)
    .join("");

  const actionsHtml = actions.length
    ? `<div style="margin:24px 0 0;">${actions
        .map(
          (action) =>
            `<a href="${escapeHtml(action.url)}" style="display:inline-block;margin:0 12px 12px 0;padding:10px 16px;border-radius:10px;background:#0f172a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">${escapeHtml(action.label)}</a>`
        )
        .join("")}</div>`
    : "";

  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<body style=\"margin:0;padding:24px;background:#f8fafc;font-family:'Segoe UI',Arial,sans-serif;\">",
    '<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;">',
    '<div style="padding:20px 24px;background:linear-gradient(135deg,#0f172a,#1d4ed8);">',
    `<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#bfdbfe;">Loan Platform Alert</div>`,
    `<h1 style="margin:8px 0 0;color:#ffffff;font-size:24px;line-height:1.3;">${title}</h1>`,
    "</div>",
    '<div style="padding:24px;">',
    `<p style="margin:0 0 16px;color:#0f172a;font-size:15px;">${recipientName}，您好：</p>`,
    body,
    actionsHtml,
    '<p style="margin:24px 0 0;color:#64748b;font-size:12px;line-height:1.6;">此邮件由借贷平台自动发送，请勿直接回复。</p>',
    "</div>",
    "</div>",
    "</body>",
    "</html>",
  ].join("");
}

function buildBaseBody(channel: DeliveryChannel, payload: DeliveryPayload) {
  const meta = toPlainObject(payload.meta);
  const event =
    typeof payload.meta?.type === "string" && payload.meta.type
      ? payload.meta.type
      : "GENERIC_NOTIFICATION";
  const templateCode =
    typeof payload.meta?.templateCode === "string" && payload.meta.templateCode
      ? payload.meta.templateCode
      : event;
  const severity: DeliverySeverity =
    payload.meta?.severity === "warning" || payload.meta?.severity === "critical"
      ? payload.meta.severity
      : "info";
  const actions = extractActions(payload.meta);
  const preview = truncate(collapseWhitespace(payload.content), 160);

  return {
    event,
    channel,
    audience: payload.audience,
    severity,
    template: {
      code: templateCode,
      locale: "zh-CN",
      variables: {
        recipientName: payload.name,
        title: payload.title,
        content: normalizeText(payload.content),
      },
    },
    recipient: {
      id: payload.targetId,
      name: payload.name,
      phone: payload.phone ?? null,
      email: payload.email ?? null,
    },
    notification: {
      title: payload.title,
      content: normalizeText(payload.content),
      preview,
    },
    actions,
    metadata: meta,
    sentAt: new Date().toISOString(),
  };
}

function buildChannelPayload(channel: DeliveryChannel, payload: DeliveryPayload) {
  const base = buildBaseBody(channel, payload);

  if (channel === "EMAIL") {
    return {
      ...base,
      email: {
        to: payload.email,
        subject: payload.title,
        text: normalizeText(payload.content),
        html: buildEmailHtml(payload, base.actions),
      },
    };
  }

  if (channel === "WHATSAPP") {
    return {
      ...base,
      whatsapp: {
        to: payload.phone,
        text: normalizeText(payload.content),
        previewUrl: base.actions.some((action) => /^https?:\/\//.test(action.url)),
      },
    };
  }

  return {
    ...base,
    sms: {
      to: payload.phone,
      text: truncate(collapseWhitespace(payload.content), 480),
      unicode: true,
    },
  };
}

async function postToWebhook(channel: DeliveryChannel, payload: DeliveryPayload) {
  const url = CHANNEL_CONFIG[channel];
  if (!url) return;

  const hasPhone = Boolean(payload.phone);
  const hasEmail = Boolean(payload.email);

  if ((channel === "SMS" || channel === "WHATSAPP") && !hasPhone) return;
  if (channel === "EMAIL" && !hasEmail) return;

  const body = buildChannelPayload(channel, payload);
  const token = CHANNEL_TOKENS[channel];
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Notify-Channel": channel,
    "X-Notify-Event": body.event,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      console.error(
        `[MessageDeliveryService] ${channel} delivery failed with ${response.status}: ${responseText}`
      );
    }
  } catch (error) {
    console.error(`[MessageDeliveryService] ${channel} delivery failed`, error);
  }
}

async function dispatchToContacts(payload: DeliveryPayload) {
  await Promise.allSettled([
    postToWebhook("SMS", payload),
    postToWebhook("WHATSAPP", payload),
    postToWebhook("EMAIL", payload),
  ]);
}

function mergeMeta(params: {
  type?: string;
  templateCode?: string;
  meta?: Record<string, unknown>;
}) {
  return {
    ...(params.meta ?? {}),
    ...(params.type ? { type: params.type } : {}),
    ...(params.templateCode ? { templateCode: params.templateCode } : {}),
  } as DeliveryMeta;
}

export class MessageDeliveryService {
  static async deliverCustomerAlert(params: {
    customerId: string;
    title: string;
    content: string;
    type: string;
    templateCode?: string;
    meta?: Record<string, unknown>;
  }) {
    const customer = await prisma.customer.findUnique({
      where: { id: params.customerId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
      },
    });

    if (!customer) return;

    await this.dispatch({
      audience: "CUSTOMER",
      targetId: customer.id,
      name: customer.name,
      title: params.title,
      content: params.content,
      phone: customer.phone,
      email: customer.email,
      meta: mergeMeta(params),
    });
  }

  static async deliverFunderAlert(params: {
    funderId: string;
    title: string;
    content: string;
    type: string;
    templateCode?: string;
    meta?: Record<string, unknown>;
  }) {
    const funder = await prisma.funder.findUnique({
      where: { id: params.funderId },
      select: {
        id: true,
        name: true,
        loginPhone: true,
        contactPhone: true,
        contactEmail: true,
      },
    });

    if (!funder) return;

    await this.dispatch({
      audience: "FUNDER",
      targetId: funder.id,
      name: funder.name,
      title: params.title,
      content: params.content,
      phone: funder.contactPhone || funder.loginPhone,
      email: funder.contactEmail,
      meta: mergeMeta(params),
    });
  }

  static async deliverAdminAlert(params: {
    userId: string;
    title: string;
    content: string;
    type: string;
    templateCode?: string;
    meta?: Record<string, unknown>;
  }) {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: {
        id: true,
        username: true,
        realName: true,
        phone: true,
        email: true,
      },
    });

    if (!user) return;

    await this.dispatch({
      audience: "ADMIN",
      targetId: user.id,
      name: user.realName || user.username,
      title: params.title,
      content: params.content,
      phone: user.phone,
      email: user.email,
      meta: mergeMeta(params),
    });
  }

  static async deliverOperationsAlert(params: {
    name: string;
    title: string;
    content: string;
    phone?: string | null;
    email?: string | null;
    type?: string;
    templateCode?: string;
    meta?: Record<string, unknown>;
  }) {
    await dispatchToContacts({
      audience: "ADMIN",
      targetId: "operations",
      name: params.name,
      title: params.title,
      content: params.content,
      phone: params.phone,
      email: params.email,
      meta: mergeMeta(params),
    });
  }

  private static async dispatch(payload: DeliveryPayload) {
    await dispatchToContacts(payload);
  }
}
