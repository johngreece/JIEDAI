import http from "http";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

process.env.NOTIFY_EMAIL_WEBHOOK_URL = "http://127.0.0.1:4010/email";
process.env.NOTIFY_EMAIL_WEBHOOK_TOKEN = "email-token";
process.env.NOTIFY_WHATSAPP_WEBHOOK_URL = "http://127.0.0.1:4010/whatsapp";
process.env.NOTIFY_WHATSAPP_WEBHOOK_TOKEN = "whatsapp-token";
process.env.NOTIFY_SMS_WEBHOOK_URL = "http://127.0.0.1:4010/sms";
process.env.NOTIFY_SMS_WEBHOOK_TOKEN = "sms-token";
process.env.REGRESSION_ALERT_EMAILS = "ops@example.com";
process.env.REGRESSION_ALERT_PHONES = "+40123456789";

type CaptureEntry = {
  url: string;
  authorization: string | null;
  channel: string | null;
  event: string | null;
  body: any;
};

async function main() {
  const captures: CaptureEntry[] = [];

  const server = http.createServer((req, res) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", () => {
      captures.push({
        url: req.url ?? "",
        authorization: req.headers.authorization ?? null,
        channel: req.headers["x-notify-channel"]?.toString() ?? null,
        event: req.headers["x-notify-event"]?.toString() ?? null,
        body: body ? JSON.parse(body) : null,
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(4010, "127.0.0.1", () => resolve());
  });

  const { RegressionAlertService } = await import("@/services/regression-alert.service");

  const result = await RegressionAlertService.notifyFailure({
    status: "FAILED",
    workflow: "Nightly Regression",
    repository: "johngreece/JIEDAI",
    branch: "main",
    sha: "abcdef1234567890",
    actor: "github-actions[bot]",
    runId: "local-run-001",
    runNumber: "999",
    runUrl: "https://github.com/johngreece/JIEDAI/actions/runs/local-run-001",
    failedJob: "regression",
    summary: "Nightly regression workflow failed during local webhook integration testing.",
    triggeredAt: "2026-03-21T10:30:00Z",
  });

  await new Promise((resolve) => setTimeout(resolve, 200));
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  const summary = captures.map((capture) => ({
    url: capture.url,
    channel: capture.channel,
    event: capture.event,
    authorization: capture.authorization,
    templateCode: capture.body?.template?.code ?? null,
    title: capture.body?.notification?.title ?? null,
    actionCount: Array.isArray(capture.body?.actions) ? capture.body.actions.length : 0,
    hasEmailPayload: Boolean(capture.body?.email),
    hasWhatsappPayload: Boolean(capture.body?.whatsapp),
    hasSmsPayload: Boolean(capture.body?.sms),
  }));

  console.log(
    JSON.stringify(
      {
        result,
        captureCount: captures.length,
        summary,
      },
      null,
      2
    )
  );
}

void main();
