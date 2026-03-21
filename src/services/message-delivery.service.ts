import { prisma } from "@/lib/prisma";

type DeliveryAudience = "CUSTOMER" | "FUNDER" | "ADMIN";
type DeliveryChannel = "SMS" | "WHATSAPP" | "EMAIL";
type DeliverySeverity = "info" | "warning" | "critical";
type EmailProvider = "NONE" | "WEBHOOK" | "RESEND";
type SmsProvider = "NONE" | "WEBHOOK" | "TWILIO";
type WhatsappProvider = "NONE" | "WEBHOOK" | "TWILIO" | "META";
type DeliverySourceType =
  | "NOTIFICATION"
  | "FUNDER_NOTIFICATION"
  | "ADMIN_NOTIFICATION"
  | "OPERATIONS_ALERT"
  | "DIRECT";

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

type DeliverySourceRef = {
  sourceType?: DeliverySourceType;
  sourceId?: string | null;
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

type ProviderExecutionResult = {
  provider: string;
  requestBody: unknown;
  responseBody: unknown;
  providerMessageId?: string | null;
  deliveredAt?: Date;
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

const DEFAULT_MAX_ATTEMPTS = Math.max(1, Number(process.env.NOTIFY_MAX_ATTEMPTS || 5));

function normalizeText(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

function collapseWhitespace(value: string) {
  return normalizeText(value).replace(/\s+/g, " ");
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
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

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: "stringify_failed" });
  }
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

function resolveProviderName(channel: DeliveryChannel) {
  if (channel === "EMAIL") return getEmailProvider();
  if (channel === "SMS") return getSmsProvider();
  return getWhatsappProvider();
}

function hasWebhookFallback(channel: DeliveryChannel) {
  return Boolean(WEBHOOK_URLS[channel]);
}

async function parseResponse(response: Response) {
  const text = await response.text().catch(() => "");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

async function postToWebhook(channel: DeliveryChannel, payload: DeliveryPayload) {
  const url = WEBHOOK_URLS[channel];
  if (!url) {
    throw new Error(`Webhook for ${channel} is not configured`);
  }

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

  const responseBody = await parseResponse(response);
  if (!response.ok) {
    throw new Error(`Webhook returned ${response.status}`);
  }

  return {
    provider: "WEBHOOK",
    requestBody: { url, headers, body },
    responseBody,
    providerMessageId:
      typeof responseBody?.id === "string"
        ? responseBody.id
        : typeof responseBody?.messageId === "string"
          ? responseBody.messageId
          : null,
  } satisfies ProviderExecutionResult;
}

async function sendEmailViaResend(payload: DeliveryPayload) {
  if (!payload.email) {
    throw new Error("Email target is missing");
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || process.env.NOTIFY_EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("Resend is not configured");
  }

  const actions = extractActions(payload.meta);
  const body = {
    from,
    to: [payload.email],
    subject: payload.title,
    text: normalizeText(payload.content),
    html: buildEmailHtml(payload, actions),
    tags: [
      { name: "event", value: String(payload.meta?.type || "GENERIC_NOTIFICATION") },
      { name: "audience", value: payload.audience },
      {
        name: "template_code",
        value: String(payload.meta?.templateCode || payload.meta?.type || "GENERIC_NOTIFICATION"),
      },
    ],
  };

  const url = `${process.env.RESEND_API_BASE_URL || "https://api.resend.com"}/emails`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const responseBody = await parseResponse(response);
  if (!response.ok) {
    throw new Error(`Resend returned ${response.status}`);
  }

  return {
    provider: "RESEND",
    requestBody: { url, from, body },
    responseBody,
    providerMessageId: typeof responseBody?.id === "string" ? responseBody.id : null,
  } satisfies ProviderExecutionResult;
}

async function sendSmsViaTwilio(payload: DeliveryPayload) {
  const to = normalizePhone(payload.phone);
  const from = normalizePhone(process.env.TWILIO_SMS_FROM);
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!to || !from || !sid || !token) {
    throw new Error("Twilio SMS is not configured");
  }

  const body = {
    To: to,
    From: from,
    Body: truncate(collapseWhitespace(payload.content), 480),
  };
  const url = `${process.env.TWILIO_API_BASE_URL || "https://api.twilio.com/2010-04-01"}/Accounts/${sid}/Messages.json`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${encodeBasicAuth(sid, token)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });

  const responseBody = await parseResponse(response);
  if (!response.ok) {
    throw new Error(`Twilio SMS returned ${response.status}`);
  }

  return {
    provider: "TWILIO",
    requestBody: { url, body },
    responseBody,
    providerMessageId:
      typeof responseBody?.sid === "string"
        ? responseBody.sid
        : typeof responseBody?.id === "string"
          ? responseBody.id
          : null,
  } satisfies ProviderExecutionResult;
}

async function sendWhatsappViaTwilio(payload: DeliveryPayload) {
  const to = normalizeWhatsappAddress(payload.phone);
  const from = normalizeWhatsappAddress(process.env.TWILIO_WHATSAPP_FROM);
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!to || !from || !sid || !token) {
    throw new Error("Twilio WhatsApp is not configured");
  }

  const actions = extractActions(payload.meta);
  const bodyText = [normalizeText(payload.content)];
  if (actions.length) {
    bodyText.push("", ...actions.map((action) => `${action.label}: ${action.url}`));
  }

  const body = {
    To: to,
    From: from,
    Body: bodyText.join("\n"),
  };
  const url = `${process.env.TWILIO_API_BASE_URL || "https://api.twilio.com/2010-04-01"}/Accounts/${sid}/Messages.json`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${encodeBasicAuth(sid, token)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });

  const responseBody = await parseResponse(response);
  if (!response.ok) {
    throw new Error(`Twilio WhatsApp returned ${response.status}`);
  }

  return {
    provider: "TWILIO",
    requestBody: { url, body },
    responseBody,
    providerMessageId:
      typeof responseBody?.sid === "string"
        ? responseBody.sid
        : typeof responseBody?.id === "string"
          ? responseBody.id
          : null,
  } satisfies ProviderExecutionResult;
}

async function sendWhatsappViaMeta(payload: DeliveryPayload) {
  const to = normalizePhone(payload.phone);
  const token = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  if (!to || !token || !phoneNumberId) {
    throw new Error("Meta WhatsApp is not configured");
  }

  const actions = extractActions(payload.meta);
  const bodyText = [normalizeText(payload.content)];
  if (actions.length) {
    bodyText.push("", ...actions.map((action) => `${action.label}: ${action.url}`));
  }

  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: {
      preview_url: actions.some((action) => /^https?:\/\//.test(action.url)),
      body: bodyText.join("\n"),
    },
  };
  const url = `${process.env.META_WHATSAPP_API_BASE_URL || "https://graph.facebook.com"}/v22.0/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const responseBody = await parseResponse(response);
  if (!response.ok) {
    throw new Error(`Meta WhatsApp returned ${response.status}`);
  }

  return {
    provider: "META",
    requestBody: { url, body },
    responseBody,
    providerMessageId:
      typeof responseBody?.messages?.[0]?.id === "string"
        ? responseBody.messages[0].id
        : typeof responseBody?.id === "string"
          ? responseBody.id
          : null,
  } satisfies ProviderExecutionResult;
}

async function executeProvider(channel: DeliveryChannel, payload: DeliveryPayload, provider: string) {
  if (channel === "EMAIL") {
    if (provider === "RESEND") return sendEmailViaResend(payload);
    if (provider === "WEBHOOK") return postToWebhook(channel, payload);
  }

  if (channel === "SMS") {
    if (provider === "TWILIO") return sendSmsViaTwilio(payload);
    if (provider === "WEBHOOK") return postToWebhook(channel, payload);
  }

  if (channel === "WHATSAPP") {
    if (provider === "META") return sendWhatsappViaMeta(payload);
    if (provider === "TWILIO") return sendWhatsappViaTwilio(payload);
    if (provider === "WEBHOOK") return postToWebhook(channel, payload);
  }

  throw new Error(`No provider is configured for ${channel}`);
}

function computeNextRetryAt(attemptCount: number) {
  const delayMinutes = Math.min(60, 2 ** Math.max(0, attemptCount - 1));
  return new Date(Date.now() + delayMinutes * 60 * 1000);
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

async function queueChannelDelivery(
  channel: DeliveryChannel,
  payload: DeliveryPayload,
  source: DeliverySourceRef
) {
  const event =
    typeof payload.meta?.type === "string" && payload.meta.type
      ? payload.meta.type
      : "GENERIC_NOTIFICATION";
  const templateCode =
    typeof payload.meta?.templateCode === "string" ? payload.meta.templateCode : null;

  return prisma.messageDelivery.create({
    data: {
      sourceType: source.sourceType ?? "DIRECT",
      sourceId: source.sourceId ?? null,
      audience: payload.audience,
      targetId: payload.targetId,
      targetName: payload.name,
      channel,
      provider: resolveProviderName(channel),
      event,
      templateCode,
      title: payload.title,
      content: payload.content,
      recipientPhone: payload.phone ?? null,
      recipientEmail: payload.email ?? null,
      status: "PENDING",
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      payloadJson: safeJsonStringify(payload),
      metadataJson: safeJsonStringify(payload.meta ?? {}),
    },
  });
}

async function runAttempt(deliveryId: string, provider: string, manual = false) {
  const delivery = await prisma.messageDelivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      channel: true,
      payloadJson: true,
      attemptCount: true,
      maxAttempts: true,
      status: true,
    },
  });

  if (!delivery?.payloadJson) {
    return null;
  }

  const payload = safeJsonParse<DeliveryPayload | null>(delivery.payloadJson, null);
  if (!payload) {
    return null;
  }

  const startedAt = new Date();
  const startedMs = Date.now();
  const attemptNo = delivery.attemptCount + 1;

  try {
    const result = await executeProvider(delivery.channel as DeliveryChannel, payload, provider);
    const finishedAt = new Date();
    const durationMs = Date.now() - startedMs;

    await prisma.$transaction([
      prisma.messageDeliveryAttempt.create({
        data: {
          deliveryId: delivery.id,
          channel: delivery.channel,
          provider: result.provider,
          attemptNo,
          status: "SENT",
          startedAt,
          finishedAt,
          durationMs,
          requestJson: safeJsonStringify(result.requestBody),
          responseJson: safeJsonStringify(result.responseBody),
        },
      }),
      prisma.messageDelivery.update({
        where: { id: delivery.id },
        data: {
          provider: result.provider,
          status: "SENT",
          attemptCount: attemptNo,
          lastAttemptAt: finishedAt,
          deliveredAt: finishedAt,
          nextRetryAt: null,
          lastError: null,
          durationMs,
          providerMessageId: result.providerMessageId ?? null,
          responseJson: safeJsonStringify(result.responseBody),
        },
      }),
    ]);

    return { ok: true, provider: result.provider };
  } catch (error) {
    const finishedAt = new Date();
    const durationMs = Date.now() - startedMs;
    const errorMessage = error instanceof Error ? error.message : "unknown";
    const exhausted = !manual && attemptNo >= delivery.maxAttempts;

    await prisma.$transaction([
      prisma.messageDeliveryAttempt.create({
        data: {
          deliveryId: delivery.id,
          channel: delivery.channel,
          provider,
          attemptNo,
          status: exhausted ? "DEAD" : "FAILED",
          startedAt,
          finishedAt,
          durationMs,
          errorMessage,
        },
      }),
      prisma.messageDelivery.update({
        where: { id: delivery.id },
        data: {
          provider,
          status: exhausted ? "DEAD" : "FAILED",
          attemptCount: attemptNo,
          lastAttemptAt: finishedAt,
          nextRetryAt: exhausted ? null : computeNextRetryAt(attemptNo),
          lastError: errorMessage,
          durationMs,
        },
      }),
    ]);

    return { ok: false, provider, errorMessage, exhausted };
  }
}

async function attemptDelivery(deliveryId: string, manual = false) {
  const delivery = await prisma.messageDelivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      channel: true,
      provider: true,
      status: true,
      attemptCount: true,
      maxAttempts: true,
    },
  });

  if (!delivery || delivery.status === "SENT") {
    return null;
  }

  const primaryProvider =
    delivery.provider && delivery.provider !== "NONE"
      ? delivery.provider
      : resolveProviderName(delivery.channel as DeliveryChannel);

  const primaryResult = await runAttempt(delivery.id, primaryProvider, manual);
  if (primaryResult?.ok) {
    return primaryResult;
  }

  if (
    primaryProvider !== "WEBHOOK" &&
    hasWebhookFallback(delivery.channel as DeliveryChannel)
  ) {
    return runAttempt(delivery.id, "WEBHOOK", manual);
  }

  return primaryResult;
}

async function dispatchToContacts(payload: DeliveryPayload, source: DeliverySourceRef) {
  const tasks: Promise<unknown>[] = [];

  if (payload.phone) {
    tasks.push(
      queueChannelDelivery("SMS", payload, source).then((delivery) => attemptDelivery(delivery.id))
    );
    tasks.push(
      queueChannelDelivery("WHATSAPP", payload, source).then((delivery) => attemptDelivery(delivery.id))
    );
  }

  if (payload.email) {
    tasks.push(
      queueChannelDelivery("EMAIL", payload, source).then((delivery) => attemptDelivery(delivery.id))
    );
  }

  await Promise.allSettled(tasks);
}

export class MessageDeliveryService {
  static async retryDelivery(deliveryId: string) {
    return attemptDelivery(deliveryId, true);
  }

  static async processRetryQueue(limit = 20, ignoreSchedule = false) {
    const due = await prisma.messageDelivery.findMany({
      where: {
        status: { in: ["FAILED", "PENDING"] },
        ...(ignoreSchedule
          ? {}
          : {
              OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
            }),
      },
      orderBy: [{ nextRetryAt: "asc" }, { createdAt: "asc" }],
      take: Math.min(Math.max(limit, 1), 100),
      select: { id: true },
    });

    let processed = 0;
    let sent = 0;
    let failed = 0;

    for (const item of due) {
      const result = await attemptDelivery(item.id, false);
      processed += 1;
      if (result?.ok) sent += 1;
      else failed += 1;
    }

    return { processed, sent, failed };
  }

  static async deliverCustomerAlert(params: {
    customerId: string;
    title: string;
    content: string;
    type: string;
    templateCode?: string;
    meta?: Record<string, unknown>;
    sourceType?: DeliverySourceType;
    sourceId?: string | null;
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

    await dispatchToContacts(
      {
        audience: "CUSTOMER",
        targetId: customer.id,
        name: customer.name,
        title: params.title,
        content: params.content,
        phone: customer.phone,
        email: customer.email,
        meta: mergeMeta(params),
      },
      {
        sourceType: params.sourceType ?? "NOTIFICATION",
        sourceId: params.sourceId,
      }
    );
  }

  static async deliverFunderAlert(params: {
    funderId: string;
    title: string;
    content: string;
    type: string;
    templateCode?: string;
    meta?: Record<string, unknown>;
    sourceType?: DeliverySourceType;
    sourceId?: string | null;
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

    await dispatchToContacts(
      {
        audience: "FUNDER",
        targetId: funder.id,
        name: funder.name,
        title: params.title,
        content: params.content,
        phone: funder.contactPhone || funder.loginPhone,
        email: funder.contactEmail,
        meta: mergeMeta(params),
      },
      {
        sourceType: params.sourceType ?? "FUNDER_NOTIFICATION",
        sourceId: params.sourceId,
      }
    );
  }

  static async deliverAdminAlert(params: {
    userId: string;
    title: string;
    content: string;
    type: string;
    templateCode?: string;
    meta?: Record<string, unknown>;
    sourceType?: DeliverySourceType;
    sourceId?: string | null;
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

    await dispatchToContacts(
      {
        audience: "ADMIN",
        targetId: user.id,
        name: user.realName || user.username,
        title: params.title,
        content: params.content,
        phone: user.phone,
        email: user.email,
        meta: mergeMeta(params),
      },
      {
        sourceType: params.sourceType ?? "ADMIN_NOTIFICATION",
        sourceId: params.sourceId,
      }
    );
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
    sourceType?: DeliverySourceType;
    sourceId?: string | null;
  }) {
    await dispatchToContacts(
      {
        audience: "ADMIN",
        targetId: "operations",
        name: params.name,
        title: params.title,
        content: params.content,
        phone: params.phone,
        email: params.email,
        meta: mergeMeta(params),
      },
      {
        sourceType: params.sourceType ?? "OPERATIONS_ALERT",
        sourceId: params.sourceId,
      }
    );
  }
}
