import { prisma } from "@/lib/prisma";

type DeliveryAudience = "CUSTOMER" | "FUNDER";
type DeliveryChannel = "SMS" | "WHATSAPP" | "EMAIL";

type DeliveryPayload = {
  audience: DeliveryAudience;
  targetId: string;
  name: string;
  title: string;
  content: string;
  phone?: string | null;
  email?: string | null;
  meta?: Record<string, unknown>;
};

const CHANNEL_CONFIG: Record<DeliveryChannel, string | undefined> = {
  SMS: process.env.NOTIFY_SMS_WEBHOOK_URL,
  WHATSAPP: process.env.NOTIFY_WHATSAPP_WEBHOOK_URL,
  EMAIL: process.env.NOTIFY_EMAIL_WEBHOOK_URL,
};

async function postToWebhook(channel: DeliveryChannel, payload: DeliveryPayload) {
  const url = CHANNEL_CONFIG[channel];
  if (!url) return;

  const hasPhone = Boolean(payload.phone);
  const hasEmail = Boolean(payload.email);

  if ((channel === "SMS" || channel === "WHATSAPP") && !hasPhone) return;
  if (channel === "EMAIL" && !hasEmail) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel,
        audience: payload.audience,
        targetId: payload.targetId,
        name: payload.name,
        title: payload.title,
        content: payload.content,
        phone: payload.phone,
        email: payload.email,
        meta: payload.meta ?? {},
      }),
    });
  } catch (error) {
    console.error(`[MessageDeliveryService] ${channel} delivery failed`, error);
  }
}

export class MessageDeliveryService {
  static async deliverCustomerAlert(params: {
    customerId: string;
    title: string;
    content: string;
    type: string;
    templateCode?: string;
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
      meta: {
        type: params.type,
        templateCode: params.templateCode,
      },
    });
  }

  static async deliverFunderAlert(params: {
    funderId: string;
    title: string;
    content: string;
    type: string;
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
      meta: {
        type: params.type,
      },
    });
  }

  private static async dispatch(payload: DeliveryPayload) {
    await Promise.allSettled([
      postToWebhook("SMS", payload),
      postToWebhook("WHATSAPP", payload),
      postToWebhook("EMAIL", payload),
    ]);
  }
}
