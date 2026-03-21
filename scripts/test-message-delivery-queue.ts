import http from "http";
import { loadEnvConfig } from "@next/env";
import { prisma } from "@/lib/prisma";

loadEnvConfig(process.cwd());

process.env.NOTIFY_EMAIL_PROVIDER = "WEBHOOK";
process.env.NOTIFY_SMS_PROVIDER = "WEBHOOK";
process.env.NOTIFY_WHATSAPP_PROVIDER = "WEBHOOK";
process.env.NOTIFY_EMAIL_WEBHOOK_URL = "http://127.0.0.1:4030/email";
process.env.NOTIFY_SMS_WEBHOOK_URL = "http://127.0.0.1:4030/sms";
process.env.NOTIFY_WHATSAPP_WEBHOOK_URL = "http://127.0.0.1:4030/whatsapp";

async function main() {
  let smsCount = 0;
  const templateCode = `QUEUE_TEST_${Date.now()}`;

  const server = http.createServer((req, res) => {
    if (req.url === "/sms") {
      smsCount += 1;
      if (smsCount === 1) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "simulated_failure" }));
        return;
      }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, id: `${req.url}-ok-${smsCount}` }));
  });

  await new Promise<void>((resolve) => {
    server.listen(4030, "127.0.0.1", () => resolve());
  });

  try {
    const { MessageDeliveryService } = await import("@/services/message-delivery.service");

    await MessageDeliveryService.deliverOperationsAlert({
      name: "Queue Test",
      title: "Queue retry verification",
      content: "This message intentionally fails once on SMS and should recover on retry.",
      email: "ops@example.com",
      phone: "+40123456789",
      type: "QUEUE_TEST",
      templateCode,
      meta: {
        severity: "warning",
      },
    });

    const firstPass = await prisma.messageDelivery.findMany({
      where: { templateCode },
      orderBy: [{ channel: "asc" }],
      select: {
        id: true,
        channel: true,
        status: true,
        attemptCount: true,
        nextRetryAt: true,
      },
    });

    const retryResult = await MessageDeliveryService.processRetryQueue(10, true);

    const secondPass = await prisma.messageDelivery.findMany({
      where: { templateCode },
      orderBy: [{ channel: "asc" }],
      include: {
        attempts: {
          orderBy: { attemptNo: "asc" },
        },
      },
    });

    console.log(
      JSON.stringify(
        {
          templateCode,
          firstPass,
          retryResult,
          secondPass: secondPass.map((item) => ({
            channel: item.channel,
            status: item.status,
            attemptCount: item.attemptCount,
            attempts: item.attempts.map((attempt) => ({
              attemptNo: attempt.attemptNo,
              provider: attempt.provider,
              status: attempt.status,
            })),
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

void main();
