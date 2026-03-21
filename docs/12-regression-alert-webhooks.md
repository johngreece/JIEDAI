# 夜间回归失败告警 Webhook 说明

本平台在 GitHub Actions 夜间回归失败时，会通过内部接口 `/api/internal/regression-alerts` 触发三类告警：

- 站内告警：写入管理员消息中心
- 外部邮件：发送到 `NOTIFY_EMAIL_WEBHOOK_URL`
- 外部 WhatsApp：发送到 `NOTIFY_WHATSAPP_WEBHOOK_URL`
- 外部短信：发送到 `NOTIFY_SMS_WEBHOOK_URL`

## 本地联调

本地可以直接运行：

```bash
npm run test:regression-alert-webhooks
```

该脚本会在本地启动一个临时 mock webhook 服务，并验证三类外部通道的 payload、鉴权 header、模板码和动作链接是否正确输出。

## 必要环境变量

GitHub Actions 与部署环境至少需要配置以下变量：

- `DATABASE_URL`
- `DIRECT_URL`
- `JWT_SECRET`
- `REGRESSION_ALERT_TOKEN`

若需要外部触达，再补以下变量：

- `REGRESSION_ALERT_EMAILS`
- `REGRESSION_ALERT_PHONES`
- `NOTIFY_EMAIL_WEBHOOK_URL`
- `NOTIFY_EMAIL_WEBHOOK_TOKEN`
- `NOTIFY_WHATSAPP_WEBHOOK_URL`
- `NOTIFY_WHATSAPP_WEBHOOK_TOKEN`
- `NOTIFY_SMS_WEBHOOK_URL`
- `NOTIFY_SMS_WEBHOOK_TOKEN`

如果三类 webhook 共用同一个鉴权 token，也可以只配置：

- `NOTIFY_WEBHOOK_SHARED_TOKEN`

## Webhook Header

平台会对每一个外部 webhook 请求附带以下 header：

```http
Content-Type: application/json
Authorization: Bearer <channel-token>
X-Notify-Channel: EMAIL | WHATSAPP | SMS
X-Notify-Event: REGRESSION_FAILURE
```

其中 `Authorization` 只有在配置了对应 token 时才会发送。

## 通用 Payload 结构

三类通道都会包含以下公共字段：

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
      "title": "夜间回归失败 main",
      "content": "仓库：johngreece/JIEDAI\n工作流：Nightly Regression\n状态：FAILED"
    }
  },
  "recipient": {
    "id": "operations",
    "name": "Regression Watcher",
    "phone": "+40123456789",
    "email": "ops@example.com"
  },
  "notification": {
    "title": "夜间回归失败 main",
    "content": "仓库：johngreece/JIEDAI\n工作流：Nightly Regression\n状态：FAILED",
    "preview": "仓库：johngreece/JIEDAI 工作流：Nightly Regression 状态：FAILED"
  },
  "actions": [
    {
      "label": "查看回归运行",
      "url": "https://github.com/johngreece/JIEDAI/actions/runs/123456"
    }
  ],
  "metadata": {
    "type": "REGRESSION_FAILURE",
    "repository": "johngreece/JIEDAI",
    "workflow": "Nightly Regression",
    "branch": "main",
    "sha": "abcdef123456",
    "runId": "123456",
    "runNumber": "88",
    "runUrl": "https://github.com/johngreece/JIEDAI/actions/runs/123456",
    "failedJob": "regression",
    "summary": "Nightly regression workflow failed. Check uploaded app log artifact and workflow run details.",
    "triggeredAt": "2026-03-21T00:30:00Z",
    "actionUrl": "https://github.com/johngreece/JIEDAI/actions/runs/123456",
    "actionLabel": "查看回归运行",
    "templateCode": "REGRESSION_FAILURE_123456"
  },
  "sentAt": "2026-03-21T00:30:01.000Z"
}
```

## 邮件通道

邮件 webhook 额外包含：

```json
{
  "email": {
    "to": "ops@example.com",
    "subject": "夜间回归失败 main",
    "text": "仓库：johngreece/JIEDAI\n工作流：Nightly Regression\n状态：FAILED",
    "html": "<!doctype html>..."
  }
}
```

建议你的邮件服务直接取 `email.to`、`email.subject`、`email.text`、`email.html` 发信。

## WhatsApp 通道

WhatsApp webhook 额外包含：

```json
{
  "whatsapp": {
    "to": "+40123456789",
    "text": "仓库：johngreece/JIEDAI\n工作流：Nightly Regression\n状态：FAILED",
    "previewUrl": true
  }
}
```

建议下游适配 Meta WhatsApp Cloud API、Twilio 或你们现有的中转服务时，直接把 `whatsapp.text` 作为消息正文。

## 短信通道

短信 webhook 额外包含：

```json
{
  "sms": {
    "to": "+40123456789",
    "text": "仓库：johngreece/JIEDAI 工作流：Nightly Regression 状态：FAILED ...",
    "unicode": true
  }
}
```

短信正文会自动压缩为单行，并截断到 480 个字符以内，适合大多数短信网关。
