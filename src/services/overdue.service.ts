/**
 * 逾期服务 — 自然日简单利息模型
 * - 扫描到期未还的还款计划条目 → 创建/更新 overdue_records
 * - 到期后24小时宽限期
 * - 1~14天: 每天 1% (基于本金)
 * - 15天+:  每天 2% (基于本金)
 * - 逾期费 = 本金 × 逾期天数对应费率之和（简单利息，不复利）
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import {
  DEFAULT_OVERDUE,
  type OverdueConfig,
  type OverdueDayRecord,
} from "@/lib/interest-engine";

/** 从还款计划快照或系统配置中获取逾期配置 */
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
      const snap = JSON.parse(plan.rulesSnapshotJson);
      if (snap.overdueConfig) overdueConfig = snap.overdueConfig;
      if (snap.dueDate) dueDate = new Date(snap.dueDate);
    } catch { /* fallback */ }
  }

  return { overdueConfig, dueDate };
}

/**
 * 计算逾期罚息（简单利息，不复利）
 * 基于原始本金 × 每天对应费率
 */
function calcSimpleOverdue(
  basePrincipal: number,
  overdueDays: number,
  config: OverdueConfig,
  overdueStartDate: Date
): {
  totalPenalty: number;
  records: OverdueDayRecord[];
} {
  const records: OverdueDayRecord[] = [];
  let totalPenalty = new Decimal(0);
  const p = new Decimal(basePrincipal);

  for (let d = 1; d <= overdueDays; d++) {
    const rate = d <= config.phase1MaxDays
      ? config.phase1DailyRate
      : config.phase2DailyRate;

    const dailyInterest = p.mul(rate).div(100)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    totalPenalty = totalPenalty.plus(dailyInterest);

    const dayDate = new Date(overdueStartDate);
    dayDate.setDate(dayDate.getDate() + d - 1);

    records.push({
      day: d,
      date: dayDate.toISOString().slice(0, 10),
      dailyRate: rate,
      dailyInterest: dailyInterest.toNumber(),
    });
  }

  return {
    totalPenalty: totalPenalty.toNumber(),
    records,
  };
}

export type OverdueScanResult = {
  scannedItems: number;
  newOverdue: number;
  updatedOverdue: number;
  errors: string[];
};

/**
 * 逾期扫描主函数
 * 扫描所有 ACTIVE 还款计划中已到期且未还清的条目，
 * 到期后24小时宽限期过后，使用简单利息模型生成/更新逾期记录
 */
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
          rulesSnapshotJson: true,
          totalPrincipal: true,
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
      const { overdueConfig } = await loadOverdueConfig(applicationId);

      // 逾期起算点 = dueDate + 宽限期
      const dueEnd = new Date(item.dueDate);
      dueEnd.setHours(23, 59, 59, 999);
      const graceMs = overdueConfig.graceHours * 60 * 60 * 1000;
      const overdueStartDate = new Date(dueEnd.getTime() + graceMs);

      // 仍在宽限期内则跳过
      if (now.getTime() <= overdueStartDate.getTime()) continue;

      const overdueMs = now.getTime() - overdueStartDate.getTime();
      const overdueDays = Math.max(1, Math.ceil(overdueMs / 86400000));

      const basePrincipal = Number(item.plan.totalPrincipal);

      // 简单利息计算
      const simple = calcSimpleOverdue(
        basePrincipal,
        overdueDays,
        overdueConfig,
        overdueStartDate
      );

      const application = await prisma.loanApplication.findUnique({
        where: { id: applicationId },
        select: { customerId: true },
      });
      const customerId = application?.customerId ?? "";

      const feeDetail = JSON.stringify({
        overdueConfig,
        overdueDays,
        totalPenalty: simple.totalPenalty,
        dailyRecords: simple.records,
        calculatedAt: now.toISOString(),
      });

      const existing = await prisma.overdueRecord.findFirst({
        where: { scheduleItemId: item.id, status: "OVERDUE" },
      });

      if (existing) {
        await prisma.overdueRecord.update({
          where: { id: existing.id },
          data: {
            overdueDays,
            penaltyAmount: simple.totalPenalty,
            overdueAmount: basePrincipal + simple.totalPenalty,
            overdueFeeDetail: feeDetail,
          },
        });
        result.updatedOverdue++;
      } else {
        await prisma.overdueRecord.create({
          data: {
            customerId,
            applicationId,
            scheduleItemId: item.id,
            overdueAmount: basePrincipal + simple.totalPenalty,
            penaltyAmount: simple.totalPenalty,
            overdueDays,
            gracePeriodDays: Math.ceil(overdueConfig.graceHours / 24),
            overdueFeeDetail: feeDetail,
            status: "OVERDUE",
          },
        });

        await prisma.repaymentScheduleItem.update({
          where: { id: item.id },
          data: { status: "OVERDUE" },
        });

        result.newOverdue++;
      }
    } catch (err) {
      result.errors.push(`Item ${item.id}: ${(err as Error).message}`);
    }
  }

  return result;
}

/**
 * 解除逾期（还清后调用）
 */
export async function resolveOverdue(scheduleItemId: string) {
  await prisma.overdueRecord.updateMany({
    where: { scheduleItemId, status: "OVERDUE" },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
}

/**
 * 获取逾期列表（管理端）
 */
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
    items: items.map((x) => ({
      ...x,
      overdueAmount: Number(x.overdueAmount),
      penaltyAmount: Number(x.penaltyAmount),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
