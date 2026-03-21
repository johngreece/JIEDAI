import { prisma } from "@/lib/prisma";

type MonitorChannel = "EMAIL" | "SMS" | "WHATSAPP";

function getEmailProvider() {
  const configured = (process.env.NOTIFY_EMAIL_PROVIDER || "").trim().toUpperCase();
  if (configured === "RESEND" || configured === "WEBHOOK" || configured === "NONE") {
    return configured;
  }
  if (process.env.RESEND_API_KEY && (process.env.RESEND_FROM_EMAIL || process.env.NOTIFY_EMAIL_FROM)) {
    return "RESEND";
  }
  if (process.env.NOTIFY_EMAIL_WEBHOOK_URL) {
    return "WEBHOOK";
  }
  return "NONE";
}

function getSmsProvider() {
  const configured = (process.env.NOTIFY_SMS_PROVIDER || "").trim().toUpperCase();
  if (configured === "TWILIO" || configured === "WEBHOOK" || configured === "NONE") {
    return configured;
  }
  if (
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_SMS_FROM
  ) {
    return "TWILIO";
  }
  if (process.env.NOTIFY_SMS_WEBHOOK_URL) {
    return "WEBHOOK";
  }
  return "NONE";
}

function getWhatsappProvider() {
  const configured = (process.env.NOTIFY_WHATSAPP_PROVIDER || "").trim().toUpperCase();
  if (
    configured === "META" ||
    configured === "TWILIO" ||
    configured === "WEBHOOK" ||
    configured === "NONE"
  ) {
    return configured;
  }
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
  if (process.env.NOTIFY_WHATSAPP_WEBHOOK_URL) {
    return "WEBHOOK";
  }
  return "NONE";
}

function getActiveProvider(channel: MonitorChannel) {
  if (channel === "EMAIL") return getEmailProvider();
  if (channel === "SMS") return getSmsProvider();
  return getWhatsappProvider();
}

function hasWebhookFallback(channel: MonitorChannel) {
  if (channel === "EMAIL") return Boolean(process.env.NOTIFY_EMAIL_WEBHOOK_URL);
  if (channel === "SMS") return Boolean(process.env.NOTIFY_SMS_WEBHOOK_URL);
  return Boolean(process.env.NOTIFY_WHATSAPP_WEBHOOK_URL);
}

function computeStatus(params: {
  provider: string;
  recentSuccess: number;
  recentFailed: number;
  queueSize: number;
}) {
  if (params.provider === "NONE") return "UNCONFIGURED";
  if (params.recentFailed > 0 && params.recentSuccess === 0) return "DOWN";
  if (params.queueSize > 0 || params.recentFailed > 0) return "DEGRADED";
  return "UP";
}

export class MessageDeliveryMonitorService {
  static async getOverview() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const channels: MonitorChannel[] = ["EMAIL", "SMS", "WHATSAPP"];

    const providers = await Promise.all(
      channels.map(async (channel) => {
        const provider = getActiveProvider(channel);
        const queueWhere = {
          channel,
          status: { in: ["PENDING", "FAILED"] as string[] },
        };

        const [recentSuccess, recentFailed, queueSize, lastAttempt, avgDuration, lastSuccess, lastFailure] =
          await Promise.all([
            prisma.messageDeliveryAttempt.count({
              where: { channel, provider, status: "SENT", createdAt: { gte: since } },
            }),
            prisma.messageDeliveryAttempt.count({
              where: { channel, provider, status: { in: ["FAILED", "DEAD"] }, createdAt: { gte: since } },
            }),
            prisma.messageDelivery.count({ where: queueWhere }),
            prisma.messageDeliveryAttempt.findFirst({
              where: { channel, provider },
              orderBy: { createdAt: "desc" },
              select: { createdAt: true },
            }),
            prisma.messageDeliveryAttempt.aggregate({
              where: { channel, provider, status: "SENT", createdAt: { gte: since } },
              _avg: { durationMs: true },
            }),
            prisma.messageDeliveryAttempt.findFirst({
              where: { channel, provider, status: "SENT" },
              orderBy: { createdAt: "desc" },
              select: { createdAt: true },
            }),
            prisma.messageDeliveryAttempt.findFirst({
              where: { channel, provider, status: { in: ["FAILED", "DEAD"] } },
              orderBy: { createdAt: "desc" },
              select: { createdAt: true, errorMessage: true },
            }),
          ]);

        return {
          channel,
          provider,
          fallbackToWebhook: hasWebhookFallback(channel),
          status: computeStatus({ provider, recentSuccess, recentFailed, queueSize }),
          recentSuccess,
          recentFailed,
          queueSize,
          successRate:
            recentSuccess + recentFailed > 0
              ? Number(((recentSuccess / (recentSuccess + recentFailed)) * 100).toFixed(1))
              : null,
          avgDurationMs: avgDuration._avg.durationMs ? Math.round(avgDuration._avg.durationMs) : null,
          lastAttemptAt: lastAttempt?.createdAt ?? null,
          lastSuccessAt: lastSuccess?.createdAt ?? null,
          lastFailureAt: lastFailure?.createdAt ?? null,
          lastFailureReason: lastFailure?.errorMessage ?? null,
        };
      })
    );

    const [pending, failed, dead, deliveredToday] = await Promise.all([
      prisma.messageDelivery.count({ where: { status: "PENDING" } }),
      prisma.messageDelivery.count({ where: { status: "FAILED" } }),
      prisma.messageDelivery.count({ where: { status: "DEAD" } }),
      prisma.messageDelivery.count({
        where: {
          status: "SENT",
          deliveredAt: { gte: since },
        },
      }),
    ]);

    return {
      summary: {
        pending,
        failed,
        dead,
        deliveredToday,
      },
      providers,
    };
  }
}
