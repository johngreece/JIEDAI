import { prisma } from "@/lib/prisma";
import { MessageDeliveryService } from "@/services/message-delivery.service";

function startOfDay(date = new Date()) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function diffDays(from: Date, to: Date) {
  const left = startOfDay(from).getTime();
  const right = startOfDay(to).getTime();
  return Math.round((right - left) / 86400000);
}

function money(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function buildAppUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL;
  if (!base) return path;

  try {
    return new URL(path, base).toString();
  } catch {
    return path;
  }
}

function buildCustomerAction(type: string, actionOverride?: { actionUrl?: string; actionLabel?: string }) {
  if (actionOverride?.actionUrl) {
    return {
      actionUrl: actionOverride.actionUrl,
      actionLabel: actionOverride.actionLabel || "立即处理",
    };
  }

  if (type === "REPAYMENT_PENDING_RECEIPT") {
    return {
      actionUrl: buildAppUrl("/client/repayments?focus=pending-receipt"),
      actionLabel: "查看确认状态",
    };
  }

  if (type === "DISBURSEMENT_RECEIVED") {
    return {
      actionUrl: buildAppUrl("/client/dashboard"),
      actionLabel: "查看当前借款",
    };
  }

  return {
    actionUrl: buildAppUrl("/client/repayments?focus=current"),
    actionLabel: "去处理还款",
  };
}

async function createCustomerNotification(params: {
  customerId: string;
  templateCode: string;
  type: string;
  title: string;
  content: string;
  meta?: Record<string, unknown>;
  deliverExternal?: boolean;
}) {
  const exists = await prisma.notification.findFirst({
    where: {
      customerId: params.customerId,
      templateCode: params.templateCode,
    },
    select: { id: true },
  });

  if (exists) return null;

  const notification = await prisma.notification.create({
    data: {
      customerId: params.customerId,
      templateCode: params.templateCode,
      type: params.type,
      title: params.title,
      content: params.content,
      status: "PENDING",
    },
  });

  if (params.deliverExternal !== false) {
    await MessageDeliveryService.deliverCustomerAlert({
      customerId: params.customerId,
      title: params.title,
      content: params.content,
      type: params.type,
      templateCode: params.templateCode,
      meta: {
        ...buildCustomerAction(params.type, {
          actionUrl:
            typeof params.meta?.actionUrl === "string" ? params.meta.actionUrl : undefined,
          actionLabel:
            typeof params.meta?.actionLabel === "string" ? params.meta.actionLabel : undefined,
        }),
        ...params.meta,
      },
      sourceType: "NOTIFICATION",
      sourceId: notification.id,
    });
  }

  return notification;
}

export class ClientNotificationService {
  static async scanAll() {
    const customers = await prisma.customer.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    let created = 0;

    for (const customer of customers) {
      const result = await this.syncForCustomer(customer.id);
      created += result.created;
    }

    return { scanned: customers.length, created };
  }

  static async syncForCustomer(customerId: string, options?: { deliverExternal?: boolean }) {
    const now = new Date();
    const today = startOfDay(now);
    const tomorrow = addDays(today, 1);

    const application = await prisma.loanApplication.findFirst({
      where: {
        customerId,
        deletedAt: null,
        status: {
          in: ["APPROVED", "PENDING_CONTRACT", "CONTRACT_SIGNED", "PENDING_DISBURSEMENT", "DISBURSED"],
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        product: { select: { name: true } },
        disbursement: {
          select: {
            id: true,
            status: true,
            netAmount: true,
            disbursedAt: true,
          },
        },
      },
    });

    if (!application) return { created: 0 };

    let created = 0;

    if (application.disbursement?.status === "PAID") {
      const result = await createCustomerNotification({
        customerId,
        templateCode: `CLIENT_DISBURSEMENT_RECEIVED_${application.disbursement.id}`,
        type: "DISBURSEMENT_RECEIVED",
        title: "请确认收款",
        content: `你的借款 ${application.applicationNo} 已放款，预计到账 ${money(
          Number(application.disbursement.netAmount || 0)
        )}，请尽快进入借款页面确认收款。`,
        meta: {
          severity: "info",
        },
        deliverExternal: options?.deliverExternal,
      });
      if (result) created += 1;
    }

    const plan = await prisma.repaymentPlan.findFirst({
      where: {
        applicationId: application.id,
        status: "ACTIVE",
      },
      select: {
        id: true,
        scheduleItems: {
          where: {
            status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
          },
          orderBy: { dueDate: "asc" },
          select: {
            id: true,
            periodNumber: true,
            dueDate: true,
            totalDue: true,
            remaining: true,
            status: true,
          },
        },
      },
    });

    const customerConfirmedRepayment = plan
      ? await prisma.repayment.findFirst({
          where: {
            planId: plan.id,
            status: "CUSTOMER_CONFIRMED",
          },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            amount: true,
            repaymentNo: true,
          },
        })
      : null;

    const nextItem = plan?.scheduleItems[0];
    if (nextItem && !customerConfirmedRepayment) {
      const remaining = Number(nextItem.remaining || nextItem.totalDue || 0);
      const daysUntilDue = diffDays(now, nextItem.dueDate);

      if (daysUntilDue === 3 || daysUntilDue === 1) {
        const result = await createCustomerNotification({
          customerId,
          templateCode: `CLIENT_DUE_SOON_D${daysUntilDue}_${nextItem.id}_${nextItem.dueDate
            .toISOString()
            .slice(0, 10)}`,
          type: "REPAYMENT_DUE_SOON",
          title: daysUntilDue === 1 ? "明日需要还款" : "还款即将到期",
          content: `当前借款第 ${nextItem.periodNumber} 期将于 ${nextItem.dueDate.toLocaleDateString(
            "zh-CN"
          )} 到期，应还 ${money(remaining)}，请提前安排资金。`,
          meta: {
            severity: "warning",
            stage: "pre_due",
            daysUntilDue,
            amountDue: remaining,
          },
          deliverExternal: options?.deliverExternal,
        });
        if (result) created += 1;
      }

      if (nextItem.dueDate >= today && nextItem.dueDate < tomorrow) {
        const result = await createCustomerNotification({
          customerId,
          templateCode: `CLIENT_DUE_TODAY_${nextItem.id}_${today.toISOString().slice(0, 10)}`,
          type: "REPAYMENT_DUE_TODAY",
          title: "今天需要还款",
          content: `当前借款第 ${nextItem.periodNumber} 期今天到期，应还 ${money(
            remaining
          )}，点击后可直接进入当前还款确认页。`,
          meta: {
            severity: "warning",
            stage: "due_today",
            daysUntilDue: 0,
            amountDue: remaining,
          },
          deliverExternal: options?.deliverExternal,
        });
        if (result) created += 1;
      }
    }

    const overdueRecords = customerConfirmedRepayment
      ? []
      : await prisma.overdueRecord.findMany({
          where: {
            customerId,
            applicationId: application.id,
            status: "OVERDUE",
          },
          select: {
            id: true,
            overdueDays: true,
            overdueAmount: true,
            penaltyAmount: true,
          },
          orderBy: { overdueDays: "desc" },
        });

    for (const record of overdueRecords.filter((item) => [1, 3, 7].includes(item.overdueDays))) {
      const severity =
        record.overdueDays >= 7 ? "critical" : record.overdueDays >= 3 ? "warning" : "info";
      const result = await createCustomerNotification({
        customerId,
        templateCode: `CLIENT_OVERDUE_${record.id}_D${record.overdueDays}`,
        type: "REPAYMENT_OVERDUE",
        title: `借款已逾期 ${record.overdueDays} 天`,
        content: `当前借款已逾期 ${record.overdueDays} 天，累计逾期费用 ${money(
          Number(record.penaltyAmount)
        )}，当前应处理金额 ${money(Number(record.overdueAmount))}。`,
        meta: {
          severity,
          stage: `overdue_d${record.overdueDays}`,
          overdueDays: record.overdueDays,
          overdueAmount: Number(record.overdueAmount),
          penaltyAmount: Number(record.penaltyAmount),
        },
        deliverExternal: options?.deliverExternal,
      });
      if (result) created += 1;
    }

    const pendingRepayment = plan
      ? await prisma.repayment.findFirst({
          where: {
            planId: plan.id,
            status: "PENDING_CONFIRM",
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            amount: true,
            repaymentNo: true,
          },
        })
      : null;

    if (pendingRepayment) {
      const result = await createCustomerNotification({
        customerId,
        templateCode: `CLIENT_PENDING_CONFIRM_${pendingRepayment.id}`,
        type: "REPAYMENT_CONFIRM",
        title: "请确认本次付款",
        content: `还款单 ${pendingRepayment.repaymentNo} 等待你确认，本次金额 ${money(
          Number(pendingRepayment.amount)
        )}。`,
        meta: {
          severity: "info",
          actionUrl: buildAppUrl(`/client/sign/repayment/${pendingRepayment.id}`),
          actionLabel: "去确认付款",
        },
        deliverExternal: options?.deliverExternal,
      });
      if (result) created += 1;
    }

    if (customerConfirmedRepayment) {
      const result = await createCustomerNotification({
        customerId,
        templateCode: `CLIENT_PENDING_RECEIPT_${customerConfirmedRepayment.id}`,
        type: "REPAYMENT_PENDING_RECEIPT",
        title: "后台正在确认到账",
        content: `你已报备付款 ${customerConfirmedRepayment.repaymentNo}，金额 ${money(
          Number(customerConfirmedRepayment.amount)
        )}。如果后台标记未收款，本金会恢复继续计息。`,
        meta: {
          severity: "info",
          stage: "pending_receipt",
          amount: Number(customerConfirmedRepayment.amount),
        },
        deliverExternal: options?.deliverExternal,
      });
      if (result) created += 1;
    }

    return { created };
  }

  static async list(customerId: string, limit = 50) {
    return prisma.notification.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  static async markRead(customerId: string, notificationId: string) {
    return prisma.notification.updateMany({
      where: { id: notificationId, customerId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  static async markAllRead(customerId: string) {
    return prisma.notification.updateMany({
      where: { customerId, isRead: false },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  static async unreadCount(customerId: string) {
    return prisma.notification.count({
      where: { customerId, isRead: false },
    });
  }
}
