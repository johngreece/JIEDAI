import type { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { deriveRepaymentOpenComponents } from "@/lib/repayment-allocation";
import {
  calculateLiveOutstandingFromSnapshot,
  extractPaidDates,
} from "@/lib/repayment-runtime";
import {
  RESTRUCTURE_BLOCKING_REPAYMENT_STATUSES,
  calculateRestructureBalances,
} from "@/lib/restructure-plan";
import { RestructureConflictError } from "@/lib/restructure-lifecycle";
import { prisma } from "@/lib/prisma";

const blockingRepaymentStatuses = [
  ...RESTRUCTURE_BLOCKING_REPAYMENT_STATUSES,
] as string[];

type RestructurePlanSnapshot = {
  totalPrincipal: Decimal.Value;
  rulesSnapshotJson: string | null;
  scheduleItems: Array<{
    id: string;
    remaining: Decimal.Value;
    remainingPrincipal: Decimal.Value;
    remainingInterest: Decimal.Value;
    remainingFee: Decimal.Value;
  }>;
};

type ActiveOverdueSnapshot = {
  scheduleItemId: string;
  penaltyAmount: Decimal.Value;
  overdueFeeDetail: string | null;
};

function calculateCurrentRestructureBalances(params: {
  plan: RestructurePlanSnapshot;
  disbursedAt: Date | null | undefined;
  confirmedAmount: number;
  overdueRecords: ActiveOverdueSnapshot[];
}) {
  const staticBalances = calculateRestructureBalances(
    params.plan.scheduleItems,
    params.overdueRecords.map((record) => record.penaltyAmount),
  );
  if (params.plan.scheduleItems.length !== 1) return staticBalances;

  const item = params.plan.scheduleItems[0];
  const overdueRecord = params.overdueRecords.find(
    (record) => record.scheduleItemId === item.id,
  );
  const liveOutstanding = calculateLiveOutstandingFromSnapshot({
    rulesSnapshotJson: params.plan.rulesSnapshotJson,
    principal: Number(params.plan.totalPrincipal),
    disbursedAt: params.disbursedAt,
    paymentTime: new Date(),
    paidDates: extractPaidDates(overdueRecord?.overdueFeeDetail),
  });
  if (liveOutstanding == null) return staticBalances;

  const totalOpen = Math.max(0, liveOutstanding - params.confirmedAmount);
  const components = deriveRepaymentOpenComponents(item, totalOpen);
  if (
    totalOpen > 0.0001 &&
    components.principal + components.interest + components.fee <= 0.0001
  ) {
    throw new Error("Repayment schedule item is missing component balances");
  }

  return {
    principal: new Decimal(components.principal).toDecimalPlaces(4),
    interest: new Decimal(components.interest).toDecimalPlaces(4),
    fee: new Decimal(components.fee).toDecimalPlaces(4),
    penalty: new Decimal(components.penalty).toDecimalPlaces(4),
  };
}

export async function loadRestructurePlanSnapshot(
  tx: Prisma.TransactionClient,
  planId: string,
) {
  const plan = await tx.repaymentPlan.findUnique({
    where: { id: planId },
    include: { scheduleItems: { orderBy: { periodNumber: "asc" } } },
  });
  if (!plan || plan.status !== "ACTIVE") {
    throw new RestructureConflictError("还款计划已发生变化，请刷新后重新申请");
  }

  const blockingRepayment = await tx.repayment.findFirst({
    where: {
      planId,
      status: { in: blockingRepaymentStatuses },
    },
    select: { id: true, status: true },
  });
  if (blockingRepayment) {
    throw new RestructureConflictError("该计划存在处理中的还款，请先完成或拒绝该还款");
  }

  const [overdueRecords, application, confirmedRepayments] = await Promise.all([
    tx.overdueRecord.findMany({
      where: {
        scheduleItemId: { in: plan.scheduleItems.map((item) => item.id) },
        status: "OVERDUE",
      },
      orderBy: { createdAt: "desc" },
      select: {
        scheduleItemId: true,
        penaltyAmount: true,
        overdueFeeDetail: true,
      },
    }),
    tx.loanApplication.findUnique({
      where: { id: plan.applicationId },
      select: { disbursement: { select: { disbursedAt: true } } },
    }),
    tx.repayment.aggregate({
      where: { planId, status: "CONFIRMED" },
      _sum: { amount: true },
    }),
  ]);

  let balances;
  try {
    balances = calculateCurrentRestructureBalances({
      plan,
      disbursedAt: application?.disbursement?.disbursedAt,
      confirmedAmount: Number(confirmedRepayments._sum.amount ?? 0),
      overdueRecords,
    });
  } catch {
    throw new RestructureConflictError(
      "还款计划缺少分项余额，请先完成数据修复后再申请重组",
    );
  }

  if (balances.principal.lte(0)) {
    throw new RestructureConflictError("该计划没有可重组的剩余本金");
  }

  return { plan, balances };
}

export async function getRestructureCandidates() {
  const plans = await prisma.repaymentPlan.findMany({
    where: { status: "ACTIVE" },
    include: { scheduleItems: { orderBy: { periodNumber: "asc" } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  if (plans.length === 0) return [];

  const applicationIds = [...new Set(plans.map((plan) => plan.applicationId))];
  const planIds = plans.map((plan) => plan.id);
  const scheduleItemIds = plans.flatMap((plan) =>
    plan.scheduleItems.map((item) => item.id),
  );

  const [
    applications,
    pendingRestructures,
    blockingRepayments,
    confirmedRepayments,
    overdueRecords,
  ] = await Promise.all([
      prisma.loanApplication.findMany({
        where: {
          id: { in: applicationIds },
          status: { in: ["DISBURSED", "OVERDUE"] },
        },
        select: {
          id: true,
          applicationNo: true,
          status: true,
          customer: { select: { name: true, phone: true } },
          product: { select: { name: true } },
          disbursement: { select: { disbursedAt: true } },
        },
      }),
      prisma.restructure.findMany({
        where: { applicationId: { in: applicationIds }, status: "PENDING" },
        select: { applicationId: true },
      }),
      prisma.repayment.findMany({
        where: {
          planId: { in: planIds },
          status: { in: blockingRepaymentStatuses },
        },
        select: { planId: true },
      }),
      prisma.repayment.groupBy({
        by: ["planId"],
        where: { planId: { in: planIds }, status: "CONFIRMED" },
        _sum: { amount: true },
      }),
      prisma.overdueRecord.findMany({
        where: {
          scheduleItemId: { in: scheduleItemIds },
          status: "OVERDUE",
        },
        orderBy: { createdAt: "desc" },
        select: {
          scheduleItemId: true,
          penaltyAmount: true,
          overdueFeeDetail: true,
        },
      }),
    ]);

  const applicationMap = new Map(applications.map((item) => [item.id, item]));
  const pendingApplicationIds = new Set(
    pendingRestructures.map((item) => item.applicationId),
  );
  const blockedPlanIds = new Set(blockingRepayments.map((item) => item.planId));
  const confirmedAmountByPlan = new Map(
    confirmedRepayments.map((item) => [item.planId, Number(item._sum.amount ?? 0)]),
  );
  const overdueByItem = new Map<string, ActiveOverdueSnapshot>();
  overdueRecords.forEach((item) => {
    if (!overdueByItem.has(item.scheduleItemId)) {
      overdueByItem.set(item.scheduleItemId, item);
    }
  });

  return plans.flatMap((plan) => {
    const application = applicationMap.get(plan.applicationId);
    if (
      !application ||
      pendingApplicationIds.has(plan.applicationId) ||
      blockedPlanIds.has(plan.id)
    ) {
      return [];
    }

    try {
      const balances = calculateCurrentRestructureBalances({
        plan,
        disbursedAt: application.disbursement?.disbursedAt,
        confirmedAmount: confirmedAmountByPlan.get(plan.id) ?? 0,
        overdueRecords: plan.scheduleItems.flatMap((item) => {
          const overdue = overdueByItem.get(item.id);
          return overdue ? [overdue] : [];
        }),
      });
      if (balances.principal.lte(0)) return [];

      return [
        {
          applicationId: application.id,
          applicationNo: application.applicationNo,
          applicationStatus: application.status,
          customerName: application.customer.name,
          customerPhone: application.customer.phone,
          productName: application.product.name,
          planId: plan.id,
          planNo: plan.planNo,
          planVersion: plan.version,
          remainingPrincipal: balances.principal.toNumber(),
          remainingInterest: balances.interest.toNumber(),
          remainingFee: balances.fee.toNumber(),
          remainingPenalty: balances.penalty.toNumber(),
        },
      ];
    } catch {
      return [];
    }
  });
}
