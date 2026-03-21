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
  return `€${value.toFixed(2)}`;
}

async function createCustomerNotification(params: {
  customerId: string;
  templateCode: string;
  type: string;
  title: string;
  content: string;
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

  await MessageDeliveryService.deliverCustomerAlert({
    customerId: params.customerId,
    title: params.title,
    content: params.content,
    type: params.type,
    templateCode: params.templateCode,
  });

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

  static async syncForCustomer(customerId: string) {
    const now = new Date();
    const today = startOfDay(now);
    const tomorrow = addDays(today, 1);

    const application = await prisma.loanApplication.findFirst({
      where: {
        customerId,
        deletedAt: null,
        status: {
          notIn: ["SETTLED", "COMPLETED", "REJECTED"],
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

      if (daysUntilDue >= 1 && daysUntilDue <= 3) {
        const result = await createCustomerNotification({
          customerId,
          templateCode: `CLIENT_DUE_SOON_${nextItem.id}_${nextItem.dueDate.toISOString().slice(0, 10)}`,
          type: "REPAYMENT_DUE_SOON",
          title: "还款即将到期",
          content: `当前借款第 ${nextItem.periodNumber} 期将于 ${nextItem.dueDate.toLocaleDateString(
            "zh-CN"
          )} 到期，应还 ${money(remaining)}，请提前安排资金。`,
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
          )}，点击后可直接进入当前还款处理页。`,
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

    for (const record of overdueRecords) {
      const result = await createCustomerNotification({
        customerId,
        templateCode: `CLIENT_OVERDUE_${record.id}_D${record.overdueDays}`,
        type: "REPAYMENT_OVERDUE",
        title: "借款已逾期",
        content: `当前借款已逾期 ${record.overdueDays} 天，累计逾期费用 ${money(
          Number(record.penaltyAmount)
        )}，当前应处理金额 ${money(Number(record.overdueAmount))}。`,
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
