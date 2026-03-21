import { prisma } from "@/lib/prisma";

type DeliveryAudience = "CUSTOMER" | "FUNDER" | "ADMIN";
type DeliveryChannel = "SMS" | "WHATSAPP" | "EMAIL";
type DeliverySeverity = "info" | "warning" | "critical";
type EmailProvider = "NONE" | "WEBHOOK" | "RESEND";
type SmsProvider = "NONE" | "WEBHOOK" | "TWILIO";
type WhatsappProvider = "NONE" | "WEBHOOK" | "TWILIO" | "META";

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

type BaseMessageBody = {
  event: string;
  channel: DeliveryChannel;
  audience: DeliveryAudience;
  severity: DeliverySeverity;
  template: {
    code: string;
    locale: string;
    variables: {
      recipientName: string;
      title: string;
      content: string;
    };
  };
  recipient: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
  };
  notification: {
    title: string;
    content: string;
    preview: string;
  };
  actions: DeliveryAction[];
  metadata: Record<string, unknown>;
  sentAt: string;
};

const WEBHOOK_URLS: Record<DeliveryChannel, string | undefined> = {
  SMS: process.env.NOTIFY_SMS_WEBHOOK_URL,
  WHATSAPP: process.env.NOTIFY_WHATSAPP_WEBHOOK_URL,
  EMAIL: process.env.NOTIFY_EMAIL_WEBHOOK_URL,
};

const WEBHOOK_TOKENS: Record<DeliveryChannel, string | undefined> = {
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
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
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
        typeof meta.actionLabel === "string" && meta.actionLabel ? meta.actionLabel : "View details",
      url: meta.actionUrl,
    });
  }

  return actions.filter(
    (action, index, list) =>
      list.findIndex((item) => item.label === action.label && item.url === action.url) === index
  );
}

function buildEmailHtml(payload: DeliveryPayload, actions: DeliveryAction[]) {
  const body = normalizeText(payload.content)
    .split("\n")
    .map(
      (line) =>
        `<p style="margin:0 0 12px;color:#334155;font-size:14px;line-height:1.7;">${escapeHtml(line)}</p>`
    )
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
    '<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#bfdbfe;">Loan Platform Alert</div>',
    `<h1 style="margin:8px 0 0;color:#ffffff;font-size:24px;line-height:1.3;">${escapeHtml(payload.title)}</h1>`,
    "</div>",
    '<div style="padding:24px;">',
    `<p style="margin:0 0 16px;color:#0f172a;font-size:15px;">${escapeHtml(payload.name)}，您好：</p>`,
    body,
    actionsHtml,
    '<p style="margin:24px 0 0;color:#64748b;font-size:12px;line-height:1.6;">This email was sent automatically by the loan platform.</p>',
    "</div>",
    "</div>",
    "</body>",
    "</html>",
  ].join("");
}

function buildBaseBody(channel: DeliveryChannel, payload: DeliveryPayload): BaseMessageBody {
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
      preview: truncate(collapseWhitespace(payload.content), 160),
    },
    actions: extractActions(payload.meta),
    metadata: meta,
    sentAt: new Date().toISOString(),
  };
}

function buildWebhookBody(channel: DeliveryChannel, payload: DeliveryPayload) {
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

function encodeBasicAuth(username: string, password: string) {
  return Buffer.from(`${username}:${password}`, "utf8").toString("base64");
}

function normalizePhone(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) return trimmed;

  const digits = trimmed.replace(/[^\d]/g, "");
  return digits ? `+${digits}` : null;
}

function normalizeWhatsappAddress(value: string | null | undefined) {
  const phone = normalizePhone(value);
  if (!phone) return null;
  return phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`;
}

function getEmailProvider(): EmailProvider {
  const configured = (process.env.NOTIFY_EMAIL_PROVIDER || "").trim().toUpperCase();
  if (configured === "RESEND") return "RESEND";
  if (configured === "WEBHOOK") return "WEBHOOK";
  if (configured === "NONE") return "NONE";

  if (process.env.RESEND_API_KEY && (process.env.RESEND_FROM_EMAIL || process.env.NOTIFY_EMAIL_FROM)) {
    return "RESEND";
  }

  return WEBHOOK_URLS.EMAIL ? "WEBHOOK" : "NONE";
}

function getSmsProvider(): SmsProvider {
  const configured = (process.env.NOTIFY_SMS_PROVIDER || "").trim().toUpperCase();
  if (configured === "TWILIO") return "TWILIO";
  if (configured === "WEBHOOK") return "WEBHOOK";
  if (configured === "NONE") return "NONE";

  if (
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_SMS_FROM
  ) {
    return "TWILIO";
  }

  return WEBHOOK_URLS.SMS ? "WEBHOOK" : "NONE";
}

function getWhatsappProvider(): WhatsappProvider {
  const configured = (process.env.NOTIFY_WHATSAPP_PROVIDER || "").trim().toUpperCase();
  if (configured === "META") return "META";
  if (configured === "TWILIO") return "TWILIO";
  if (configured === "WEBHOOK") return "WEBHOOK";
  if (configured === "NONE") return "NONE";

  if (process.env.META_WHATSAPP_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID) {
    return "META";
  }

  if (
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_FROM
  ) {
    return "TWILIO";
  }

  return WEBHOOK_URLS.WHATSAPP ? "WEBHOOK" : "NONE";
}

async function postToWebhook(channel: DeliveryChannel, payload: DeliveryPayload) {
  const url = WEBHOOK_URLS[channel];
  if (!url) return false;

  const body = buildWebhookBody(channel, payload);
  const token = WEBHOOK_TOKENS[channel];
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Notify-Channel": channel,
    "X-Notify-Event": body.event,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Webhook returned ${response.status}`);
  }

  return true;
}

async function sendEmailViaResend(payload: DeliveryPayload) {
  if (!payload.email) return false;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || process.env.NOTIFY_EMAIL_FROM;
  if (!apiKey || !from) return false;

  const actions = extractActions(payload.meta);
  const response = await fetch(
    `${process.env.RESEND_API_BASE_URL || "https://api.resend.com"}/emails`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [payload.email],
        subject: payload.title,
        text: normalizeText(payload.content),
        html: buildEmailHtml(payload, actions),
        tags: [
          { name: "event", value: String(payload.meta?.type || "GENERIC_NOTIFICATION") },
          { name: "audience", value: payload.audience },
          { name: "template_code", value: String(payload.meta?.templateCode || payload.meta?.type || "GENERIC_NOTIFICATION") },
        ],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Resend returned ${response.status}`);
  }

  return true;
}

async function sendSmsViaTwilio(payload: DeliveryPayload) {
  const to = normalizePhone(payload.phone);
  const from = normalizePhone(process.env.TWILIO_SMS_FROM);
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!to || !from || !sid || !token) return false;

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("From", from);
  form.set("Body", truncate(collapseWhitespace(payload.content), 480));

  const response = await fetch(
    `${process.env.TWILIO_API_BASE_URL || "https://api.twilio.com/2010-04-01"}/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${encodeBasicAuth(sid, token)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    }
  );

  if (!response.ok) {
    throw new Error(`Twilio SMS returned ${response.status}`);
  }

  return true;
}

async function sendWhatsappViaTwilio(payload: DeliveryPayload) {
  const to = normalizeWhatsappAddress(payload.phone);
  const from = normalizeWhatsappAddress(process.env.TWILIO_WHATSAPP_FROM);
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!to || !from || !sid || !token) return false;

  const bodyLines = [normalizeText(payload.content)];
  const actions = extractActions(payload.meta);
  if (actions.length) {
    bodyLines.push("", ...actions.map((action) => `${action.label}: ${action.url}`));
  }

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("From", from);
  form.set("Body", bodyLines.join("\n"));

  const response = await fetch(
    `${process.env.TWILIO_API_BASE_URL || "https://api.twilio.com/2010-04-01"}/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${encodeBasicAuth(sid, token)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    }
  );

  if (!response.ok) {
    throw new Error(`Twilio WhatsApp returned ${response.status}`);
  }

  return true;
}

async function sendWhatsappViaMeta(payload: DeliveryPayload) {
  const to = normalizePhone(payload.phone);
  const token = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  if (!to || !token || !phoneNumberId) return false;

  const actions = extractActions(payload.meta);
  const bodyLines = [normalizeText(payload.content)];
  if (actions.length) {
    bodyLines.push("", ...actions.map((action) => `${action.label}: ${action.url}`));
  }

  const response = await fetch(
    `${process.env.META_WHATSAPP_API_BASE_URL || "https://graph.facebook.com"}/v22.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: {
          preview_url: actions.some((action) => /^https?:\/\//.test(action.url)),
          body: bodyLines.join("\n"),
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Meta WhatsApp returned ${response.status}`);
  }

  return true;
}

async function deliverByChannel(channel: DeliveryChannel, payload: DeliveryPayload) {
  const webhookAvailable = Boolean(WEBHOOK_URLS[channel]);

  try {
    if (channel === "EMAIL") {
      const provider = getEmailProvider();
      if (provider === "RESEND") return await sendEmailViaResend(payload);
      if (provider === "WEBHOOK") return await postToWebhook(channel, payload);
      return false;
    }

    if (channel === "SMS") {
      const provider = getSmsProvider();
      if (provider === "TWILIO") return await sendSmsViaTwilio(payload);
      if (provider === "WEBHOOK") return await postToWebhook(channel, payload);
      return false;
    }

    const provider = getWhatsappProvider();
    if (provider === "META") return await sendWhatsappViaMeta(payload);
    if (provider === "TWILIO") return await sendWhatsappViaTwilio(payload);
    if (provider === "WEBHOOK") return await postToWebhook(channel, payload);
    return false;
  } catch (error) {
    console.error(`[MessageDeliveryService] ${channel} delivery failed`, error);

    if (webhookAvailable) {
      try {
        return await postToWebhook(channel, payload);
      } catch (webhookError) {
        console.error(`[MessageDeliveryService] ${channel} webhook fallback failed`, webhookError);
      }
    }

    return false;
  }
}

async function dispatchToContacts(payload: DeliveryPayload) {
  await Promise.allSettled([
    payload.phone ? deliverByChannel("SMS", payload) : Promise.resolve(false),
    payload.phone ? deliverByChannel("WHATSAPP", payload) : Promise.resolve(false),
    payload.email ? deliverByChannel("EMAIL", payload) : Promise.resolve(false),
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
