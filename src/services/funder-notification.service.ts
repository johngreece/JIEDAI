import { prisma } from "@/lib/prisma";

/**
 * 资金方通知服务
 * 处理利息到期通知、提现审批通知等
 */
export class FunderNotificationService {
  /**
   * 扫描所有固定月息资金方，对满1个月的注资生成到期通知
   * 应由定时任务或管理端手动触发
   */
  static async scanInterestMaturity() {
    const funders = await prisma.funder.findMany({
      where: { cooperationMode: "FIXED_MONTHLY", isActive: true, deletedAt: null },
      include: {
        accounts: { where: { isActive: true } },
      },
    });

    const now = new Date();
    let created = 0;

    for (const funder of funders) {
      const accountIds = funder.accounts.map((a) => a.id);
      if (!accountIds.length) continue;

      const inflows = await prisma.capitalInflow.findMany({
        where: { fundAccountId: { in: accountIds }, status: "CONFIRMED" },
      });

      for (const inflow of inflows) {
        const inflowDate = new Date(inflow.inflowDate);
        const daysSince = Math.floor(
          (now.getTime() - inflowDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const fullMonths = Math.floor(daysSince / 30);

        // 在每满一个月时检查是否已发送过此月的通知
        if (fullMonths >= 1) {
          const notifKey = `MATURITY_${inflow.id}_M${fullMonths}`;
          const exists = await prisma.funderNotification.findFirst({
            where: { funderId: funder.id, title: notifKey },
          });

          if (!exists) {
            const interest =
              Number(inflow.amount) * (Number(funder.monthlyRate) / 100) * fullMonths;
            await prisma.funderNotification.create({
              data: {
                funderId: funder.id,
                type: "INTEREST_MATURITY",
                title: notifKey,
                content: `您于 ${inflowDate.toISOString().split("T")[0]} 投入的 €${Number(inflow.amount).toFixed(2)} 已满 ${fullMonths} 个月，累计利息 €${interest.toFixed(2)}，可申请提现。`,
              },
            });
            created++;
          }
        }
      }
    }

    return { scanned: funders.length, created };
  }

  /**
   * 发送通用通知
   */
  static async send(funderId: string, type: string, title: string, content: string) {
    return prisma.funderNotification.create({
      data: { funderId, type, title, content },
    });
  }

  /**
   * 获取资金方通知列表
   */
  static async list(funderId: string, limit = 30) {
    return prisma.funderNotification.findMany({
      where: { funderId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /**
   * 标记为已读
   */
  static async markRead(funderId: string, notificationId: string) {
    return prisma.funderNotification.updateMany({
      where: { id: notificationId, funderId },
      data: { isRead: true },
    });
  }

  /**
   * 标记全部已读
   */
  static async markAllRead(funderId: string) {
    return prisma.funderNotification.updateMany({
      where: { funderId, isRead: false },
      data: { isRead: true },
    });
  }

  /**
   * 未读数量
   */
  static async unreadCount(funderId: string) {
    return prisma.funderNotification.count({
      where: { funderId, isRead: false },
    });
  }
}
