import { prisma } from "@/lib/prisma";
import { FunderInterestService } from "@/services/funder-interest.service";
import { MessageDeliveryService } from "@/services/message-delivery.service";

function money(value: number) {
  return `€${value.toFixed(2)}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

async function canRequestPrincipalByDate(funderId: string, targetDate: Date, cooldownDays: number) {
  if (!cooldownDays) return true;

  const lastApproved = await prisma.funderWithdrawal.findFirst({
    where: {
      funderId,
      status: "APPROVED",
    },
    orderBy: { approvedAt: "desc" },
    select: { approvedAt: true },
  });

  if (!lastApproved?.approvedAt) return true;

  return addDays(lastApproved.approvedAt, cooldownDays) <= targetDate;
}

async function createFunderNotification(params: {
  funderId: string;
  type: string;
  title: string;
  content: string;
  dedupeTitle?: string;
}) {
  const exists = await prisma.funderNotification.findFirst({
    where: {
      funderId: params.funderId,
      title: params.dedupeTitle || params.title,
    },
    select: { id: true },
  });

  if (exists) return null;

  const notification = await prisma.funderNotification.create({
    data: {
      funderId: params.funderId,
      type: params.type,
      title: params.dedupeTitle || params.title,
      content: params.content,
    },
  });

  await MessageDeliveryService.deliverFunderAlert({
    funderId: params.funderId,
    title: params.title,
    content: params.content,
    type: params.type,
  });

  return notification;
}

export class FunderNotificationService {
  static async scanInterestMaturity() {
    const funders = await prisma.funder.findMany({
      where: { isActive: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        cooperationMode: true,
        withdrawalCooldownDays: true,
      },
    });

    let created = 0;
    const now = new Date();

    for (const funder of funders) {
      const earnings = await FunderInterestService.getEarnings(funder.id);

      if (earnings.withdrawableInterest > 0) {
        const result = await createFunderNotification({
          funderId: funder.id,
          type: "WITHDRAWABLE_INTEREST",
          dedupeTitle: `WITHDRAWABLE_${now.toISOString().slice(0, 10)}_${funder.id}`,
          title: "有新的可提现收益",
          content: `当前已有 ${money(earnings.withdrawableInterest)} 收益可申请提现，可提本金 ${money(
            earnings.withdrawablePrincipal
          )}。`,
        });
        if (result) created += 1;
      }

      for (const item of earnings.upcomingSettlements.slice(0, 5)) {
        const settlementDate = new Date(item.nextSettlementDate);
        const daysUntil = Math.ceil((settlementDate.getTime() - now.getTime()) / 86400000);

        if (daysUntil >= 0 && daysUntil <= 3) {
          const result = await createFunderNotification({
            funderId: funder.id,
            type: "SETTLEMENT_UPCOMING",
            dedupeTitle: `SETTLEMENT_${item.disbursementId}_${settlementDate.toISOString().slice(0, 10)}`,
            title: "收益结算日临近",
            content: `${item.customerName} 的放款单 ${item.disbursementNo} 将于 ${settlementDate.toLocaleDateString(
              "zh-CN"
            )} 进入下一次结算，预计收益 ${money(item.expectedInterest)}，预计回款 ${money(
              item.expectedCollection
            )}。`,
          });
          if (result) created += 1;
        }

        if (
          daysUntil === 2 &&
          (await canRequestPrincipalByDate(
            funder.id,
            settlementDate,
            funder.withdrawalCooldownDays
          ))
        ) {
          const result = await createFunderNotification({
            funderId: funder.id,
            type: "PRINCIPAL_RETURN_SOON",
            dedupeTitle: `PRINCIPAL_RETURN_${item.disbursementId}_${settlementDate.toISOString().slice(0, 10)}`,
            title: "本金回款窗口将开放",
            content: `距离 ${item.disbursementNo} 的下一次回款窗口还有 2 天，预计回款日 ${settlementDate.toLocaleDateString(
              "zh-CN"
            )}，预计可回款 ${money(item.expectedCollection)}，预计收益 ${money(item.expectedInterest)}。`,
          });
          if (result) created += 1;
        }
      }
    }

    return { scanned: funders.length, created };
  }

  static async send(funderId: string, type: string, title: string, content: string) {
    return prisma.funderNotification.create({
      data: { funderId, type, title, content },
    });
  }

  static async list(funderId: string, limit = 30) {
    return prisma.funderNotification.findMany({
      where: { funderId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  static async markRead(funderId: string, notificationId: string) {
    return prisma.funderNotification.updateMany({
      where: { id: notificationId, funderId },
      data: { isRead: true },
    });
  }

  static async markAllRead(funderId: string) {
    return prisma.funderNotification.updateMany({
      where: { funderId, isRead: false },
      data: { isRead: true },
    });
  }

  static async unreadCount(funderId: string) {
    return prisma.funderNotification.count({
      where: { funderId, isRead: false },
    });
  }
}
