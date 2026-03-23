import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  DEFAULT_OVERDUE,
  calculateOverdueBreakdown,
  type OverdueConfig,
} from "@/lib/interest-engine";

async function loadOverdueConfig(applicationId: string): Promise<{
  overdueConfig: OverdueConfig;
  dueDate: Date | null;
}> {
  const plan = await prisma.repaymentPlan.findFirst({
    where: { applicationId, status: "ACTIVE" },
    select: { rulesSnapshotJson: true },
  });

  let overdueConfig: OverdueConfig = DEFAULT_OVERDUE;
  let dueDate: Date | null = null;

  if (plan?.rulesSnapshotJson) {
    try {
      const snap = JSON.parse(plan.rulesSnapshotJson) as {
        overdueConfig?: OverdueConfig;
        dueDate?: string;
      };
      if (snap.overdueConfig) overdueConfig = snap.overdueConfig;
      if (snap.dueDate) dueDate = new Date(snap.dueDate);
    } catch {
      // ignore invalid snapshot
    }
  }

  return { overdueConfig, dueDate };
}

export type OverdueScanResult = {
  scannedItems: number;
  newOverdue: number;
  updatedOverdue: number;
  errors: string[];
};

function extractPaidDates(detail: string | null): string[] {
  if (!detail) return [];
  try {
    const parsed = JSON.parse(detail) as { paidDates?: string[] };
    return parsed.paidDates ?? [];
  } catch {
    return [];
  }
}

export async function scanOverdueItems(): Promise<OverdueScanResult> {
  const now = new Date();

  const overdueItems = await prisma.repaymentScheduleItem.findMany({
    where: {
      status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
      dueDate: { lt: now },
      plan: { status: "ACTIVE" },
    },
    include: {
      plan: {
        select: {
          applicationId: true,
        },
      },
    },
  });

  const result: OverdueScanResult = {
    scannedItems: overdueItems.length,
    newOverdue: 0,
    updatedOverdue: 0,
    errors: [],
  };

  for (const item of overdueItems) {
    try {
      const applicationId = item.plan.applicationId;
      const { overdueConfig, dueDate } = await loadOverdueConfig(applicationId);
      const dueAt = dueDate ?? item.dueDate;
      const overdueStartDate = new Date(dueAt.getTime() + overdueConfig.graceHours * 60 * 60 * 1000);

      if (now.getTime() <= overdueStartDate.getTime()) continue;

      const overdueDays = Math.max(1, Math.ceil((now.getTime() - overdueStartDate.getTime()) / 86400000));
      const baseAmount = Number(item.remaining || item.totalDue);
      const existing = await prisma.overdueRecord.findFirst({
        where: { scheduleItemId: item.id, status: "OVERDUE" },
      });
      const paidDates = extractPaidDates(existing?.overdueFeeDetail ?? null);
      const breakdown = calculateOverdueBreakdown({
        baseAmount,
        overdueDays,
        overdueConfig,
        overdueStartDate,
        paidDates,
      });

      const application = await prisma.loanApplication.findUnique({
        where: { id: applicationId },
        select: { customerId: true },
      });
      const customerId = application?.customerId ?? "";

      const detail = JSON.stringify({
        overdueConfig,
        overdueDays,
        baseAmount,
        paidDates,
        overdueStartDate: overdueStartDate.toISOString(),
        totalOutstanding: breakdown.totalOutstanding,
        outstandingPenalty: breakdown.outstandingPenalty,
        dailyRecords: breakdown.dailyRecords,
        calculatedAt: now.toISOString(),
      });

      if (existing) {
        await prisma.overdueRecord.update({
          where: { id: existing.id },
          data: {
            overdueDays,
            penaltyAmount: breakdown.outstandingPenalty,
            overdueAmount: breakdown.totalOutstanding,
            overdueFeeDetail: detail,
          },
        });
        result.updatedOverdue += 1;
      } else {
        await prisma.overdueRecord.create({
          data: {
            customerId,
            applicationId,
            scheduleItemId: item.id,
            overdueAmount: breakdown.totalOutstanding,
            penaltyAmount: breakdown.outstandingPenalty,
            overdueDays,
            gracePeriodDays: Math.ceil(overdueConfig.graceHours / 24),
            overdueFeeDetail: detail,
            status: "OVERDUE",
          },
        });

        await prisma.repaymentScheduleItem.update({
          where: { id: item.id },
          data: { status: "OVERDUE" },
        });

        result.newOverdue += 1;
      }
    } catch (error) {
      result.errors.push(`Item ${item.id}: ${(error as Error).message}`);
    }
  }

  return result;
}

export async function resolveOverdue(scheduleItemId: string) {
  await prisma.overdueRecord.updateMany({
    where: { scheduleItemId, status: "OVERDUE" },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
}

export async function getOverdueList(params: {
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const { status, page = 1, pageSize = 20 } = params;
  const where: Prisma.OverdueRecordWhereInput = {
    ...(status ? { status } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.overdueRecord.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
      },
    }),
    prisma.overdueRecord.count({ where }),
  ]);

  return {
    items: items.map((item) => ({
      ...item,
      overdueAmount: Number(item.overdueAmount),
      penaltyAmount: Number(item.penaltyAmount),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
