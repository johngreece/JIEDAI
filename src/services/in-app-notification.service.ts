import { prisma } from "@/lib/prisma";

type AdminNotificationParams = {
  type: string;
  title: string;
  content: string;
  templateCode?: string;
};

type CustomerNotificationParams = {
  customerId: string;
  type: string;
  title: string;
  content: string;
  templateCode?: string;
};

export class InAppNotificationService {
  static async notifyAdmins(params: AdminNotificationParams) {
    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
      },
      select: { id: true },
    });

    if (users.length === 0) return { created: 0 };

    let targetUserIds = users.map((user) => user.id);

    if (params.templateCode) {
      const existing = await prisma.notification.findMany({
        where: {
          userId: { in: targetUserIds },
          templateCode: params.templateCode,
        },
        select: { userId: true },
      });

      const existingUserIds = new Set(existing.map((item) => item.userId).filter(Boolean) as string[]);
      targetUserIds = targetUserIds.filter((userId) => !existingUserIds.has(userId));
    }

    if (targetUserIds.length === 0) return { created: 0 };

    const result = await prisma.notification.createMany({
      data: targetUserIds.map((userId) => ({
        userId,
        type: params.type,
        title: params.title,
        content: params.content,
        templateCode: params.templateCode ?? null,
        status: "PENDING",
      })),
    });

    return { created: result.count };
  }

  static async notifyCustomer(params: CustomerNotificationParams) {
    if (params.templateCode) {
      const existing = await prisma.notification.findFirst({
        where: {
          customerId: params.customerId,
          templateCode: params.templateCode,
        },
        select: { id: true },
      });

      if (existing) return existing;
    }

    return prisma.notification.create({
      data: {
        customerId: params.customerId,
        type: params.type,
        title: params.title,
        content: params.content,
        templateCode: params.templateCode ?? null,
        status: "PENDING",
      },
      select: { id: true },
    });
  }
}
