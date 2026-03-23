import http from "http";
import bcrypt from "bcryptjs";
import { loadEnvConfig } from "@next/env";
import { prisma } from "@/lib/prisma";

loadEnvConfig(process.cwd());

const PORT = 4040;
const BASE_URL = `http://127.0.0.1:${PORT}`;

type CapturedRequest = {
  path: string;
  body: unknown;
};

function asJson(value: string) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return value;
  }
}

function getActionUrls(body: unknown) {
  if (!body || typeof body !== "object") return [];
  const actions = (body as { actions?: Array<{ url?: string }> }).actions;
  if (!Array.isArray(actions)) return [];
  return actions.map((item) => item?.url).filter((item): item is string => Boolean(item));
}

async function ensureTouchpointCustomer() {
  const existing = await prisma.customer.findFirst({
    where: { deletedAt: null, phone: { not: "" } },
    select: { id: true, name: true, phone: true, email: true },
    orderBy: { createdAt: "asc" },
  });

  if (existing) return existing;

  return prisma.customer.create({
    data: {
      name: "Touchpoint Customer",
      phone: `696${String(Date.now()).slice(-7)}`,
      passwordHash: await bcrypt.hash("customer123", 10),
      idNumber: `TP${Date.now()}`,
      email: "touchpoint-customer@example.com",
      address: "Touchpoint Fixture",
    },
    select: { id: true, name: true, phone: true, email: true },
  });
}

async function ensureTouchpointFunder() {
  const existing = await prisma.funder.findFirst({
    where: { deletedAt: null, isActive: true, loginPhone: { not: "" } },
    select: {
      id: true,
      name: true,
      loginPhone: true,
      contactPhone: true,
      contactEmail: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (existing) return existing;

  const phone = `697${String(Date.now()).slice(-7)}`;
  const created = await prisma.funder.create({
    data: {
      name: `Touchpoint Funder ${Date.now()}`,
      type: "COMPANY",
      loginPhone: phone,
      passwordHash: await bcrypt.hash("funder123", 10),
      contactPerson: "Touchpoint Fixture",
      contactPhone: phone,
      contactEmail: "touchpoint-funder@example.com",
      cooperationMode: "FIXED_MONTHLY",
      monthlyRate: 1,
      priority: 1,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      loginPhone: true,
      contactPhone: true,
      contactEmail: true,
    },
  });

  await prisma.fundAccount.create({
    data: {
      funderId: created.id,
      accountName: `${created.name} Account`,
      bankName: "Touchpoint Bank",
      accountNo: `TP-${Date.now()}`,
      balance: 100000,
      totalInflow: 100000,
    },
  });

  return created;
}

async function main() {
  process.env.NOTIFY_EMAIL_PROVIDER = "WEBHOOK";
  process.env.NOTIFY_SMS_PROVIDER = "WEBHOOK";
  process.env.NOTIFY_WHATSAPP_PROVIDER = "WEBHOOK";
  process.env.NOTIFY_EMAIL_WEBHOOK_URL = `${BASE_URL}/email`;
  process.env.NOTIFY_SMS_WEBHOOK_URL = `${BASE_URL}/sms`;
  process.env.NOTIFY_WHATSAPP_WEBHOOK_URL = `${BASE_URL}/whatsapp`;
  process.env.NOTIFY_EMAIL_WEBHOOK_TOKEN = "touchpoint-email-token";
  process.env.NOTIFY_SMS_WEBHOOK_TOKEN = "touchpoint-sms-token";
  process.env.NOTIFY_WHATSAPP_WEBHOOK_TOKEN = "touchpoint-whatsapp-token";

  const captured: Record<string, CapturedRequest[]> = {
    "/email": [],
    "/sms": [],
    "/whatsapp": [],
  };

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const body = asJson(raw);
      if (req.url && req.url in captured) {
        captured[req.url].push({ path: req.url, body });
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          providerMessageId: `${req.url || "unknown"}-${Date.now()}`,
        })
      );
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(PORT, "127.0.0.1", () => resolve());
  });

  try {
    const [{ MessageDeliveryService }, { MessageDeliveryMonitorService }] = await Promise.all([
      import("@/services/message-delivery.service"),
      import("@/services/message-delivery-monitor.service"),
    ]);

    const [customer, funder, adminWithContact] = await Promise.all([
      ensureTouchpointCustomer(),
      ensureTouchpointFunder(),
      prisma.user.findFirst({
        where: {
          deletedAt: null,
          OR: [{ phone: { not: null } }, { email: { not: null } }],
        },
        select: { id: true, username: true, realName: true, phone: true, email: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const tag = `TOUCHPOINT_${Date.now()}`;

    await MessageDeliveryService.deliverOperationsAlert({
      name: "Operations Smoke",
      title: "Regression delivery smoke",
      content: "This verifies email, SMS, WhatsApp, action links, and delivery logs.",
      email: "ops-smoke@example.com",
      phone: "+40123456789",
      type: "OPS_SMOKE",
      templateCode: `${tag}_OPS`,
      meta: {
        severity: "warning",
        actionLabel: "Open delivery center",
        actionUrl: "/admin/message-deliveries",
        actions: [
          {
            label: "Open delivery center",
            url: "/admin/message-deliveries",
          },
          {
            label: "Open launch readiness",
            url: "/admin/launch-readiness",
          },
        ],
      },
    });

    await MessageDeliveryService.deliverCustomerAlert({
      customerId: customer.id,
      title: "Due today reminder",
      content: "Open the repayment confirmation page directly from this reminder.",
      type: "DUE_TODAY",
      templateCode: `${tag}_CUSTOMER`,
      meta: {
        severity: "warning",
        actionLabel: "Review due today",
        actionUrl: "/client/repayments?tab=today",
      },
    });

    await MessageDeliveryService.deliverFunderAlert({
      funderId: funder.id,
      title: "Withdrawable earnings ready",
      content: "Jump straight into the withdrawal form with the amount prefilled.",
      type: "WITHDRAWABLE_INTEREST",
      templateCode: `${tag}_FUNDER`,
      meta: {
        severity: "info",
        actionLabel: "Withdraw now",
        actionUrl: "/funder/withdrawals?open=1&type=INTEREST&prefill=withdrawable-interest",
      },
    });

    if (adminWithContact) {
      await MessageDeliveryService.deliverAdminAlert({
        userId: adminWithContact.id,
        title: "Admin delivery drill",
        content: "This validates admin audience delivery routing.",
        type: "ADMIN_SMOKE",
        templateCode: `${tag}_ADMIN`,
        meta: {
          severity: "critical",
          actionLabel: "Open dashboard",
          actionUrl: "/admin/dashboard",
        },
      });
    }

    const deliveries = await prisma.messageDelivery.findMany({
      where: {
        templateCode: {
          startsWith: tag,
        },
      },
      orderBy: [{ templateCode: "asc" }, { channel: "asc" }],
      include: {
        attempts: {
          orderBy: { attemptNo: "asc" },
        },
      },
    });

    if (!deliveries.length) {
      throw new Error("Touchpoint inspection produced no delivery rows");
    }

    const findings: string[] = [];

    const opsDeliveries = deliveries.filter((item) => item.templateCode === `${tag}_OPS`);
    for (const channel of ["EMAIL", "SMS", "WHATSAPP"]) {
      const match = opsDeliveries.find((item) => item.channel === channel);
      if (!match) findings.push(`operations alert missing ${channel} delivery`);
      else if (match.status !== "SENT") findings.push(`operations alert ${channel} status is ${match.status}`);
    }

    for (const item of deliveries) {
      if (item.status !== "SENT") {
        findings.push(`${item.templateCode}:${item.channel} ended with status ${item.status}`);
      }

      if (!item.attempts.length) {
        findings.push(`${item.templateCode}:${item.channel} has no delivery attempts`);
        continue;
      }

      const latestAttempt = item.attempts[item.attempts.length - 1];
      if (!latestAttempt.requestJson) {
        findings.push(`${item.templateCode}:${item.channel} missing requestJson`);
      }
      if (!latestAttempt.responseJson) {
        findings.push(`${item.templateCode}:${item.channel} missing responseJson`);
      }
    }

    const emailBodies = captured["/email"].map((entry) => entry.body);
    const smsBodies = captured["/sms"].map((entry) => entry.body);
    const whatsappBodies = captured["/whatsapp"].map((entry) => entry.body);

    if (!emailBodies.length || !smsBodies.length || !whatsappBodies.length) {
      findings.push("webhook capture did not observe all three external channels");
    }

    const customerActionSeen = [...smsBodies, ...whatsappBodies]
      .flatMap((body) => getActionUrls(body))
      .includes("/client/repayments?tab=today");
    if (!customerActionSeen) {
      findings.push("customer deep link action was not present in SMS/WhatsApp payloads");
    }

    const funderActionSeen = [...smsBodies, ...whatsappBodies]
      .flatMap((body) => getActionUrls(body))
      .includes("/funder/withdrawals?open=1&type=INTEREST&prefill=withdrawable-interest");
    if (!funderActionSeen) {
      findings.push("funder withdrawal deep link action was not present in SMS/WhatsApp payloads");
    }

    const adminActionSeen = emailBodies
      .flatMap((body) => getActionUrls(body))
      .includes("/admin/message-deliveries");
    if (!adminActionSeen) {
      findings.push("admin delivery-center action was not present in email payloads");
    }

    const overview = await MessageDeliveryMonitorService.getOverview();
    const channels = ["EMAIL", "SMS", "WHATSAPP"] as const;
    for (const channel of channels) {
      const provider = overview.providers.find((item) => item.channel === channel);
      if (!provider) {
        findings.push(`monitor overview missing ${channel} provider`);
        continue;
      }
      if (provider.provider !== "WEBHOOK") {
        findings.push(`${channel} provider expected WEBHOOK, got ${provider.provider}`);
      }
      if (!provider.lastAttemptAt) {
        findings.push(`${channel} monitor missing lastAttemptAt`);
      }
    }

    if (findings.length) {
      throw new Error(`Touchpoint inspection failed:\n- ${findings.join("\n- ")}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          templatePrefix: tag,
          deliveriesCreated: deliveries.length,
          captured: {
            email: emailBodies.length,
            sms: smsBodies.length,
            whatsapp: whatsappBodies.length,
          },
          audiencesCovered: Array.from(new Set(deliveries.map((item) => item.audience))).sort(),
          channelsCovered: Array.from(new Set(deliveries.map((item) => item.channel))).sort(),
          monitor: overview.providers.map((item) => ({
            channel: item.channel,
            provider: item.provider,
            status: item.status,
            queueSize: item.queueSize,
            recentSuccess: item.recentSuccess,
            recentFailed: item.recentFailed,
          })),
        },
        null,
        2
      )
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error("[test-external-touchpoints] FAILED");
  console.error(error);
  process.exit(1);
});
