/**
 * 逾期服务
 * - 扫描到期未还的还款计划条目 → 创建/更新 overdue_records
 * - 按费率规则自动计算罚息
 * - 提供手动/定时调用入口
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import {
  DEFAULT_FEE_RATES,
  FEE_SETTING_KEYS,
  type FeeRates,
} from "@/lib/loan-fee-rules";

/** 从 system_settings 读取逾期费率配置 */
async function loadFeeRates(): Promise<FeeRates> {
  const settings = await prisma.systemSetting.findMany({
    where: {
      key: {
        in: Object.values(FEE_SETTING_KEYS),
      },
    },
  });
  const map = new Map(settings.map((s) => [s.key, s.value]));

  function getVal(key: string, fallback: number): number {
    const raw = map.get(key);
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed.value != null
        ? Number(parsed.value)
        : Number(parsed);
    } catch {
      return fallback;
    }
  }

  return {
    sameDayRate: getVal(FEE_SETTING_KEYS.sameDayRate, DEFAULT_FEE_RATES.sameDayRate),
    nextDayRate: getVal(FEE_SETTING_KEYS.nextDayRate, DEFAULT_FEE_RATES.nextDayRate),
    day3Day7Rate: getVal(FEE_SETTING_KEYS.day3Day7Rate, DEFAULT_FEE_RATES.day3Day7Rate),
    otherDayRate: getVal(FEE_SETTING_KEYS.otherDayRate, DEFAULT_FEE_RATES.otherDayRate),
    overdueGraceHours: getVal(FEE_SETTING_KEYS.overdueGraceHours, DEFAULT_FEE_RATES.overdueGraceHours),
    overdueRatePerDayBefore14: getVal(FEE_SETTING_KEYS.overdueRateBefore14, DEFAULT_FEE_RATES.overdueRatePerDayBefore14),
    overdueRatePerDayAfter14: getVal(FEE_SETTING_KEYS.overdueRateAfter14, DEFAULT_FEE_RATES.overdueRatePerDayAfter14),
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
 * 扫描所有 ACTIVE 还款计划中已到期且未还清的条目，生成/更新逾期记录
 */
export async function scanOverdueItems(): Promise<OverdueScanResult> {
  const now = new Date();
  const rates = await loadFeeRates();
  const graceMs = rates.overdueGraceHours * 60 * 60 * 1000;

  // 查找到期（含宽限期）且未还清的还款计划条目
  const cutoff = new Date(now.getTime() - graceMs);

  const overdueItems = await prisma.repaymentScheduleItem.findMany({
    where: {
      status: { in: ["PENDING", "PARTIAL"] },
      dueDate: { lt: cutoff },
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
      const dueEnd = new Date(item.dueDate);
      dueEnd.setHours(23, 59, 59, 999);
      const overdueStart = new Date(dueEnd.getTime() + graceMs);
      const overdueDays = Math.max(
        1,
        Math.ceil((now.getTime() - overdueStart.getTime()) / 86400000)
      );

      // 计算罚息：逾期金额 * 日费率
      const overdueAmount = new Decimal(item.remaining.toString()).gt(0)
        ? new Decimal(item.remaining.toString())
        : new Decimal(item.totalDue.toString());

      const daysBefore14 = Math.min(overdueDays, 14);
      const daysAfter14 = Math.max(0, overdueDays - 14);
      const penaltyAmount = overdueAmount
        .mul(daysBefore14)
        .mul(rates.overdueRatePerDayBefore14)
        .div(100)
        .plus(
          overdueAmount
            .mul(daysAfter14)
            .mul(rates.overdueRatePerDayAfter14)
            .div(100)
        )
        .toDecimalPlaces(4);

      const applicationId = item.plan.applicationId;

      // 通过 applicationId 查找 customerId
      const application = await prisma.loanApplication.findUnique({
        where: { id: applicationId },
        select: { customerId: true },
      });
      const customerId = application?.customerId ?? "";

      // 查找是否已有此条目的逾期记录
      const existing = await prisma.overdueRecord.findFirst({
        where: {
          scheduleItemId: item.id,
          status: "OVERDUE",
        },
      });

      if (existing) {
        // 更新逾期天数和罚息
        await prisma.overdueRecord.update({
          where: { id: existing.id },
          data: {
            overdueDays,
            penaltyAmount: penaltyAmount.toNumber(),
            overdueAmount: overdueAmount.toNumber(),
            overdueFeeDetail: JSON.stringify({
              rates,
              daysBefore14,
              daysAfter14,
              calculatedAt: now.toISOString(),
            }),
          },
        });
        result.updatedOverdue++;
      } else {
        // 创建新逾期记录
        await prisma.overdueRecord.create({
          data: {
            customerId,
            applicationId,
            scheduleItemId: item.id,
            overdueAmount: overdueAmount.toNumber(),
            penaltyAmount: penaltyAmount.toNumber(),
            overdueDays,
            gracePeriodDays: Math.ceil(rates.overdueGraceHours / 24),
            overdueFeeDetail: JSON.stringify({
              rates,
              daysBefore14,
              daysAfter14,
              calculatedAt: now.toISOString(),
            }),
            status: "OVERDUE",
          },
        });

        // 更新还款计划条目状态为 OVERDUE
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
