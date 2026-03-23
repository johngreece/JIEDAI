import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { ClientNotificationService } from "@/services/client-notification.service";

export const dynamic = "force-dynamic";

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

export async function POST() {
  const session = await requirePermission(["dashboard:view"]);
  if (session instanceof Response) return session;

  const application = await prisma.loanApplication.findFirst({
    where: {
      deletedAt: null,
      status: "DISBURSED",
      customer: {
        deletedAt: null,
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      applicationNo: true,
      customerId: true,
      customer: {
        select: { id: true, name: true, phone: true },
      },
    },
  });

  if (!application) {
    return NextResponse.json({ error: "No active disbursed application for notification scenario" }, { status: 404 });
  }

  const plan = await prisma.repaymentPlan.findFirst({
    where: { applicationId: application.id, status: "ACTIVE" },
    select: {
      id: true,
      scheduleItems: {
        orderBy: { periodNumber: "asc" },
        take: 1,
        select: {
          id: true,
          periodNumber: true,
          dueDate: true,
          status: true,
          totalDue: true,
          remaining: true,
          paidAt: true,
        },
      },
    },
  });

  const item = plan?.scheduleItems[0];
  if (!plan || !item) {
    return NextResponse.json({ error: "No active repayment schedule item" }, { status: 404 });
  }

  const originalOverdues = await prisma.overdueRecord.findMany({
    where: {
      customerId: application.customerId,
      applicationId: application.id,
    },
    orderBy: { createdAt: "asc" },
    select: {
      scheduleItemId: true,
      overdueAmount: true,
      penaltyAmount: true,
      overdueDays: true,
      gracePeriodDays: true,
      overdueFeeDetail: true,
      status: true,
      resolvedAt: true,
      remark: true,
    },
  });

  const originalItem = {
    dueDate: item.dueDate,
    status: item.status,
    paidAt: item.paidAt,
    remaining: item.remaining,
  };

  const amountDue = Number(item.remaining || item.totalDue);
  const basePenalty = Number((amountDue * 0.03).toFixed(2));
  const today = startOfDay(new Date());
  const stageResults: Array<{ stage: string; created: number }> = [];

  try {
    await prisma.notification.deleteMany({
      where: {
        customerId: application.customerId,
        templateCode: {
          startsWith: "CLIENT_",
        },
      },
    });

    await prisma.overdueRecord.deleteMany({
      where: {
        customerId: application.customerId,
        applicationId: application.id,
      },
    });

    const baseItemData = {
      remaining: item.remaining,
      paidAt: null,
    };

    await prisma.repaymentScheduleItem.update({
      where: { id: item.id },
      data: {
        ...baseItemData,
        dueDate: addDays(today, 3),
        status: "PENDING",
      },
    });
    stageResults.push({
      stage: "pre_due_3",
      created: (await ClientNotificationService.syncForCustomer(application.customerId, { deliverExternal: false })).created,
    });

    await prisma.repaymentScheduleItem.update({
      where: { id: item.id },
      data: {
        ...baseItemData,
        dueDate: addDays(today, 1),
        status: "PENDING",
      },
    });
    stageResults.push({
      stage: "pre_due_1",
      created: (await ClientNotificationService.syncForCustomer(application.customerId, { deliverExternal: false })).created,
    });

    await prisma.repaymentScheduleItem.update({
      where: { id: item.id },
      data: {
        ...baseItemData,
        dueDate: today,
        status: "PENDING",
      },
    });
    stageResults.push({
      stage: "due_today",
      created: (await ClientNotificationService.syncForCustomer(application.customerId, { deliverExternal: false })).created,
    });

    const overdue = await prisma.overdueRecord.create({
      data: {
        customerId: application.customerId,
        applicationId: application.id,
        scheduleItemId: item.id,
        overdueAmount: amountDue,
        penaltyAmount: basePenalty,
        overdueDays: 1,
        gracePeriodDays: 0,
        status: "OVERDUE",
        remark: "Launch readiness notification scenario",
      },
    });

    await prisma.repaymentScheduleItem.update({
      where: { id: item.id },
      data: {
        ...baseItemData,
        dueDate: addDays(today, -1),
        status: "OVERDUE",
      },
    });
    stageResults.push({
      stage: "overdue_1",
      created: (await ClientNotificationService.syncForCustomer(application.customerId, { deliverExternal: false })).created,
    });

    await prisma.overdueRecord.update({
      where: { id: overdue.id },
      data: {
        overdueDays: 3,
        penaltyAmount: Number((basePenalty * 2).toFixed(2)),
      },
    });
    await prisma.repaymentScheduleItem.update({
      where: { id: item.id },
      data: {
        ...baseItemData,
        dueDate: addDays(today, -3),
        status: "OVERDUE",
      },
    });
    stageResults.push({
      stage: "overdue_3",
      created: (await ClientNotificationService.syncForCustomer(application.customerId, { deliverExternal: false })).created,
    });

    await prisma.overdueRecord.update({
      where: { id: overdue.id },
      data: {
        overdueDays: 7,
        penaltyAmount: Number((basePenalty * 3).toFixed(2)),
      },
    });
    await prisma.repaymentScheduleItem.update({
      where: { id: item.id },
      data: {
        ...baseItemData,
        dueDate: addDays(today, -7),
        status: "OVERDUE",
      },
    });
    stageResults.push({
      stage: "overdue_7",
      created: (await ClientNotificationService.syncForCustomer(application.customerId, { deliverExternal: false })).created,
    });

    const notifications = await prisma.notification.findMany({
      where: { customerId: application.customerId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        type: true,
        templateCode: true,
        title: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      customer: application.customer,
      application: {
        id: application.id,
        applicationNo: application.applicationNo,
      },
      stages: stageResults,
      notifications,
    });
  } finally {
    await prisma.notification.deleteMany({
      where: {
        customerId: application.customerId,
        templateCode: {
          startsWith: "CLIENT_",
        },
      },
    });

    await prisma.overdueRecord.deleteMany({
      where: {
        customerId: application.customerId,
        applicationId: application.id,
      },
    });

    if (originalOverdues.length > 0) {
      await prisma.overdueRecord.createMany({
        data: originalOverdues.map((record) => ({
          customerId: application.customerId,
          applicationId: application.id,
          scheduleItemId: record.scheduleItemId,
          overdueAmount: record.overdueAmount,
          penaltyAmount: record.penaltyAmount,
          overdueDays: record.overdueDays,
          gracePeriodDays: record.gracePeriodDays,
          overdueFeeDetail: record.overdueFeeDetail,
          status: record.status,
          resolvedAt: record.resolvedAt,
          remark: record.remark,
        })),
      });
    }

    await prisma.repaymentScheduleItem.update({
      where: { id: item.id },
      data: {
        dueDate: originalItem.dueDate,
        status: originalItem.status,
        paidAt: originalItem.paidAt,
        remaining: originalItem.remaining,
      },
    });
  }
}
