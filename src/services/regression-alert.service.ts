import { prisma } from "@/lib/prisma";
import { MessageDeliveryService } from "@/services/message-delivery.service";

export type RegressionFailurePayload = {
  status: string;
  workflow: string;
  repository: string;
  branch: string;
  sha: string;
  actor?: string;
  runId?: string;
  runNumber?: string;
  runUrl?: string;
  failedJob?: string;
  summary?: string;
  triggeredAt?: string;
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function parseCsvEnv(value: string | undefined) {
  return uniqueStrings((value ?? "").split(","));
}

function buildTitle(payload: RegressionFailurePayload) {
  return `夜间回归失败 ${payload.branch || "main"}`;
}

function buildContent(payload: RegressionFailurePayload) {
  const lines = [
    `仓库：${payload.repository}`,
    `工作流：${payload.workflow}`,
    `状态：${payload.status}`,
    `分支：${payload.branch}`,
    `提交：${payload.sha}`,
  ];

  if (payload.runNumber) lines.push(`运行编号：${payload.runNumber}`);
  if (payload.runId) lines.push(`运行 ID：${payload.runId}`);
  if (payload.failedJob) lines.push(`失败任务：${payload.failedJob}`);
  if (payload.actor) lines.push(`触发人：${payload.actor}`);
  if (payload.triggeredAt) lines.push(`触发时间：${payload.triggeredAt}`);
  if (payload.runUrl) lines.push(`查看地址：${payload.runUrl}`);
  if (payload.summary) lines.push(`摘要：${payload.summary}`);

  return lines.join("\n");
}

export class RegressionAlertService {
  static async notifyFailure(payload: RegressionFailurePayload) {
    const title = buildTitle(payload);
    const content = buildContent(payload);
    const templateCode = `REGRESSION_FAILURE_${payload.runId || payload.runNumber || Date.now()}`;

    const recipients = await prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        role: {
          code: { in: ["super_admin", "manager", "finance"] },
        },
      },
      select: {
        id: true,
      },
    });

    for (const recipient of recipients) {
      const exists = await prisma.notification.findFirst({
        where: {
          userId: recipient.id,
          templateCode,
        },
        select: { id: true },
      });

      if (!exists) {
        await prisma.notification.create({
          data: {
            userId: recipient.id,
            templateCode,
            type: "REGRESSION_FAILURE",
            title,
            content,
            status: "PENDING",
            sentAt: new Date(),
          },
        });
      }

      await MessageDeliveryService.deliverAdminAlert({
        userId: recipient.id,
        title,
        content,
        type: "REGRESSION_FAILURE",
      });
    }

    const alertEmails = parseCsvEnv(process.env.REGRESSION_ALERT_EMAILS);
    const alertPhones = parseCsvEnv(process.env.REGRESSION_ALERT_PHONES);

    await Promise.allSettled([
      ...alertEmails.map((email) =>
        MessageDeliveryService.deliverOperationsAlert({
          name: "Regression Watcher",
          title,
          content,
          email,
          meta: {
            type: "REGRESSION_FAILURE",
            repository: payload.repository,
            runId: payload.runId,
          },
        })
      ),
      ...alertPhones.map((phone) =>
        MessageDeliveryService.deliverOperationsAlert({
          name: "Regression Watcher",
          title,
          content,
          phone,
          meta: {
            type: "REGRESSION_FAILURE",
            repository: payload.repository,
            runId: payload.runId,
          },
        })
      ),
    ]);

    return {
      notifiedUsers: recipients.length,
      externalEmails: alertEmails.length,
      externalPhones: alertPhones.length,
      templateCode,
    };
  }
}
