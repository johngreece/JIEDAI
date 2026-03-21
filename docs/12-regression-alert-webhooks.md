# Regression Alert Delivery

This platform can send nightly regression failure alerts through four routes:

- In-app admin notifications
- Email via `Resend` or webhook
- SMS via `Twilio` or webhook
- WhatsApp via `Meta WhatsApp Cloud API`, `Twilio`, or webhook

The internal trigger entry stays the same:

```text
POST /api/internal/regression-alerts
```

## Required Core Variables

Set these in your deployment environment and GitHub Actions secrets:

- `DATABASE_URL`
- `DIRECT_URL`
- `JWT_SECRET`
- `REGRESSION_ALERT_TOKEN`

## Alert Targets

- `REGRESSION_ALERT_EMAILS`
- `REGRESSION_ALERT_PHONES`

These are comma-separated lists used for extra ops contacts outside the admin user table.

## Provider Selection

Each channel supports an explicit provider switch.

### Email

- `NOTIFY_EMAIL_PROVIDER=RESEND`
- `NOTIFY_EMAIL_PROVIDER=WEBHOOK`
- `NOTIFY_EMAIL_PROVIDER=NONE`

If not set, the system auto-detects:

1. `RESEND` when `RESEND_API_KEY` and sender address are present
2. `WEBHOOK` when `NOTIFY_EMAIL_WEBHOOK_URL` is present
3. otherwise `NONE`

### SMS

- `NOTIFY_SMS_PROVIDER=TWILIO`
- `NOTIFY_SMS_PROVIDER=WEBHOOK`
- `NOTIFY_SMS_PROVIDER=NONE`

If not set, the system auto-detects:

1. `TWILIO` when Twilio SMS credentials exist
2. `WEBHOOK` when `NOTIFY_SMS_WEBHOOK_URL` exists
3. otherwise `NONE`

### WhatsApp

- `NOTIFY_WHATSAPP_PROVIDER=META`
- `NOTIFY_WHATSAPP_PROVIDER=TWILIO`
- `NOTIFY_WHATSAPP_PROVIDER=WEBHOOK`
- `NOTIFY_WHATSAPP_PROVIDER=NONE`

If not set, the system auto-detects:

1. `META` when Meta Cloud API credentials exist
2. `TWILIO` when Twilio WhatsApp credentials exist
3. `WEBHOOK` when `NOTIFY_WHATSAPP_WEBHOOK_URL` exists
4. otherwise `NONE`

## Resend

Use these variables for direct email delivery:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Optional:

- `RESEND_API_BASE_URL`
- `NOTIFY_EMAIL_FROM`

Request target:

```text
POST https://api.resend.com/emails
```

The system sends:

- subject
- plain text body
- HTML body
- tags for event, audience, and template code

## Twilio

Use these variables for direct SMS and optional WhatsApp delivery:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_SMS_FROM`
- `TWILIO_WHATSAPP_FROM`

Optional:

- `TWILIO_API_BASE_URL`

Request target:

```text
POST https://api.twilio.com/2010-04-01/Accounts/<SID>/Messages.json
```

For WhatsApp, the service automatically formats numbers as:

```text
whatsapp:+<number>
```

## Meta WhatsApp Cloud API

Use these variables for direct WhatsApp delivery:

- `META_WHATSAPP_TOKEN`
- `META_WHATSAPP_PHONE_NUMBER_ID`

Optional:

- `META_WHATSAPP_API_BASE_URL`

Request target:

```text
POST https://graph.facebook.com/v22.0/<PHONE_NUMBER_ID>/messages
```

The platform currently sends plain text WhatsApp messages and appends action links into the body.

## Webhook Fallback

Each channel still supports webhook delivery and also uses it as a fallback if a direct provider call fails.

### Webhook variables

- `NOTIFY_EMAIL_WEBHOOK_URL`
- `NOTIFY_EMAIL_WEBHOOK_TOKEN`
- `NOTIFY_WHATSAPP_WEBHOOK_URL`
- `NOTIFY_WHATSAPP_WEBHOOK_TOKEN`
- `NOTIFY_SMS_WEBHOOK_URL`
- `NOTIFY_SMS_WEBHOOK_TOKEN`

Optional shared token:

- `NOTIFY_WEBHOOK_SHARED_TOKEN`

### Webhook headers

```http
Content-Type: application/json
Authorization: Bearer <channel-token>
X-Notify-Channel: EMAIL | WHATSAPP | SMS
X-Notify-Event: REGRESSION_FAILURE
```

### Webhook payload shape

All channels share this base payload:

```json
{
  "event": "REGRESSION_FAILURE",
  "channel": "EMAIL",
  "audience": "ADMIN",
  "severity": "critical",
  "template": {
    "code": "REGRESSION_FAILURE_123456",
    "locale": "zh-CN",
    "variables": {
      "recipientName": "Finance Team",
      "title": "Nightly regression failed main",
      "content": "Repository: johngreece/JIEDAI"
    }
  },
  "recipient": {
    "id": "operations",
    "name": "Regression Watcher",
    "phone": "+40123456789",
    "email": "ops@example.com"
  },
  "notification": {
    "title": "Nightly regression failed main",
    "content": "Repository: johngreece/JIEDAI",
    "preview": "Repository: johngreece/JIEDAI"
  },
  "actions": [
    {
      "label": "View regression run",
      "url": "https://github.com/johngreece/JIEDAI/actions/runs/123456"
    }
  ],
  "metadata": {
    "type": "REGRESSION_FAILURE",
    "templateCode": "REGRESSION_FAILURE_123456"
  },
  "sentAt": "2026-03-21T00:30:01.000Z"
}
```

## Local Verification

Run the existing webhook flow check:

```bash
npm run test:regression-alert-webhooks
```

Run direct-provider mock verification:

```bash
npm run test:regression-alert-providers
```

The provider test spins up local mock endpoints for Resend, Twilio, and Meta WhatsApp Cloud API, then verifies that the platform produces valid outbound requests for all three direct integrations.

Run retry queue verification:

```bash
npm run test:message-delivery-queue
```

This script simulates a first-pass SMS failure, confirms that the delivery enters the retry queue, and then verifies that the retry worker can recover it successfully.
