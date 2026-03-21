import http from "http";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

process.env.NOTIFY_EMAIL_PROVIDER = "RESEND";
process.env.NOTIFY_SMS_PROVIDER = "TWILIO";
process.env.NOTIFY_WHATSAPP_PROVIDER = "META";

process.env.RESEND_API_KEY = "resend-test-key";
process.env.RESEND_FROM_EMAIL = "alerts@example.com";
process.env.RESEND_API_BASE_URL = "http://127.0.0.1:4020/resend";

process.env.TWILIO_ACCOUNT_SID = "AC_TEST";
process.env.TWILIO_AUTH_TOKEN = "twilio-token";
process.env.TWILIO_SMS_FROM = "+40111000111";
process.env.TWILIO_API_BASE_URL = "http://127.0.0.1:4020/twilio";

process.env.META_WHATSAPP_TOKEN = "meta-token";
process.env.META_WHATSAPP_PHONE_NUMBER_ID = "123456789";
process.env.META_WHATSAPP_API_BASE_URL = "http://127.0.0.1:4020/meta";

process.env.REGRESSION_ALERT_EMAILS = "ops@example.com";
process.env.REGRESSION_ALERT_PHONES = "+40123456789";

type CaptureEntry = {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
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
        method: req.method || "GET",
        url: req.url || "",
        headers: req.headers,
        body,
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: "mock-ok" }));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(4020, "127.0.0.1", () => resolve());
  });

  const { RegressionAlertService } = await import("@/services/regression-alert.service");

  const result = await RegressionAlertService.notifyFailure({
    status: "FAILED",
    workflow: "Nightly Regression",
    repository: "johngreece/JIEDAI",
    branch: "main",
    sha: "abcdef1234567890",
    actor: "github-actions[bot]",
    runId: "provider-run-001",
    runNumber: "1000",
    runUrl: "https://github.com/johngreece/JIEDAI/actions/runs/provider-run-001",
    failedJob: "regression",
    summary: "Nightly regression workflow failed during provider integration testing.",
    triggeredAt: "2026-03-21T11:00:00Z",
  });

  await new Promise((resolve) => setTimeout(resolve, 200));
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  const resendCalls = captures.filter((item) => item.url === "/resend/emails");
  const twilioCalls = captures.filter((item) => item.url === "/twilio/Accounts/AC_TEST/Messages.json");
  const metaCalls = captures.filter(
    (item) => item.url === "/meta/v22.0/123456789/messages"
  );

  const summary = {
    result,
    totalCalls: captures.length,
    resend: resendCalls.map((item) => {
      const body = JSON.parse(item.body);
      return {
        auth: item.headers.authorization,
        to: body.to,
        subject: body.subject,
        hasHtml: Boolean(body.html),
        tags: body.tags,
      };
    }),
    twilio: twilioCalls.map((item) => ({
      auth: item.headers.authorization,
      body: Object.fromEntries(new URLSearchParams(item.body).entries()),
    })),
    meta: metaCalls.map((item) => {
      const body = JSON.parse(item.body);
      return {
        auth: item.headers.authorization,
        to: body.to,
        type: body.type,
        previewUrl: body.text?.preview_url,
      };
    }),
  };

  console.log(JSON.stringify(summary, null, 2));
}

void main();
