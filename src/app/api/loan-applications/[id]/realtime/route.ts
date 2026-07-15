/**
 * GET /api/loan-applications/:id/realtime
 * 实时计算当前还款金额（基于小时窗口费率 + 逾期简单利息）
 *
 * 返回：当前阶梯、应还金额、经过天数、逾期详情等
 */

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { ensureActiveClientSession } from "@/lib/portal-session";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  calculateRealtimeRepayment,
  parseTiersFromPricingRules,
  loadFeeConfig,
  DEFAULT_TIERS,
  DEFAULT_OVERDUE,
  DEFAULT_UPFRONT_FEE_RATE,
  type ChannelType,
  type RepaymentTier,
  type OverdueConfig,
} from "@/lib/interest-engine";
import { applyCustomerPricingOverride } from "@/lib/customer-pricing";
import {
  INTEREST_FREEZE_REPAYMENT_STATUSES,
  getFrozenPayableAmount,
  getInterestFrozenAt,
} from "@/lib/repayment-runtime";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let applicationWhere: Prisma.LoanApplicationWhereInput;
  if (session.portal === "funder") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (session.portal === "admin") {
    const permission = await requirePermission(["loan:view"]);
    if (permission instanceof Response) return permission;
    applicationWhere = { id, deletedAt: null };
  } else {
    const activeClientSession = await ensureActiveClientSession(session);
    if (activeClientSession instanceof Response) return activeClientSession;
    applicationWhere = { id, customerId: session.sub, deletedAt: null };
  }

  const application = await prisma.loanApplication.findFirst({
    where: applicationWhere,
    include: {
      product: {
        include: {
          pricingRules: {
            where: { isActive: true },
            orderBy: { priority: "desc" },
          },
        },
      },
      disbursement: true,
      customer: { select: { id: true, name: true, phone: true, weeklyInterestRateOverride: true } },
    },
  });

  if (!application) {
    return NextResponse.json({ error: "借款申请不存在" }, { status: 404 });
  }

  if (
    !application.disbursement ||
    !["PAID", "CONFIRMED"].includes(application.disbursement.status)
  ) {
    return NextResponse.json({
      error: "尚未放款或放款未确认",
      status: application.status,
      disbursementStatus: application.disbursement?.status ?? null,
    }, { status: 400 });
  }

  const disbursedAt = application.disbursement.disbursedAt;
  if (!disbursedAt) {
    return NextResponse.json({ error: "放款时间未记录" }, { status: 400 });
  }

  // 尝试从还款计划快照中获取配置
  const plan = await prisma.repaymentPlan.findFirst({
    where: { applicationId: application.id, status: "ACTIVE" },
    select: { id: true, totalPrincipal: true, rulesSnapshotJson: true },
  });
  const repaymentFreeze = plan
    ? await prisma.repayment.findFirst({
        where: {
          planId: plan.id,
          status: { in: [...INTEREST_FREEZE_REPAYMENT_STATUSES] },
          interestFrozenAt: { not: null },
          frozenPayableAmount: { not: null },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          repaymentNo: true,
          status: true,
          amount: true,
          frozenPayableAmount: true,
          interestFrozenAt: true,
          receivedAt: true,
          createdAt: true,
        },
      })
    : null;
  const overdueRecord = await prisma.overdueRecord.findFirst({
    where: { applicationId: application.id, status: "OVERDUE" },
    orderBy: { createdAt: "desc" },
    select: { overdueFeeDetail: true },
  });

  let tiers: RepaymentTier[] = DEFAULT_TIERS;
  let overdueConfig: OverdueConfig = DEFAULT_OVERDUE;
  let upfrontFeeRate = DEFAULT_UPFRONT_FEE_RATE;
  let channel: ChannelType = "UPFRONT_DEDUCTION";
  let dueDate: Date | null = null;
  let normalInterestCapitalized = false;
  let fixedFeeAmount = 0;
  let netDisbursementAmount: number | undefined;

  if (plan?.rulesSnapshotJson) {
    try {
      const snap = JSON.parse(plan.rulesSnapshotJson);
      if (snap.tiers) tiers = snap.tiers;
      if (snap.overdueConfig) overdueConfig = snap.overdueConfig;
      if (snap.upfrontFeeRate != null) upfrontFeeRate = snap.upfrontFeeRate;
      if (snap.channel) channel = snap.channel;
      if (snap.dueDate) dueDate = new Date(snap.dueDate);
      if (snap.normalInterestCapitalized != null) {
        normalInterestCapitalized = Boolean(snap.normalInterestCapitalized);
      }
      if (snap.fixedFeeAmount != null) fixedFeeAmount = Number(snap.fixedFeeAmount);
      if (snap.netDisbursementAmount != null) {
        netDisbursementAmount = Number(snap.netDisbursementAmount);
      }
    } catch {
      // 快照解析失败
    }
  }

  // 如果快照中没有配置，从系统设置或产品定价规则解析
  if (!plan?.rulesSnapshotJson) {
    if (application.product.pricingRules.length > 0) {
      const parsed = parseTiersFromPricingRules(application.product.pricingRules);
      const effective = applyCustomerPricingOverride(parsed, application.customer);
      tiers = effective.tiers;
      overdueConfig = effective.overdueConfig;
      upfrontFeeRate = effective.upfrontFeeRate;
      channel = effective.channel;
    } else {
      const settingsRows = await prisma.systemSetting.findMany();
      const sysMap: Record<string, string | number> = {};
      for (const s of settingsRows) sysMap[s.key] = s.value;
      const loanOverride = null;
      const parsed = loadFeeConfig(sysMap, loanOverride);
      const effective = applyCustomerPricingOverride(parsed, application.customer);
      tiers = effective.tiers;
      overdueConfig = effective.overdueConfig;
      upfrontFeeRate = effective.upfrontFeeRate;
      channel = effective.channel;
    }
  }

  // 计算到期日（如果快照中没有）
  if (!dueDate) {
    const sortedTiers = [...tiers].sort(
      (a, b) => (a.maxHours ?? a.maxDays * 24) - (b.maxHours ?? b.maxDays * 24)
    );
    const maxHours = sortedTiers.length > 0
      ? (sortedTiers[sortedTiers.length - 1].maxHours ?? sortedTiers[sortedTiers.length - 1].maxDays * 24)
      : 7 * 24;
    dueDate = new Date(new Date(disbursedAt).getTime() + maxHours * 60 * 60 * 1000);
  }

  const principal = plan ? Number(plan.totalPrincipal) : Number(application.amount);
  const now = new Date();
  let paidDates: string[] = [];
  if (overdueRecord?.overdueFeeDetail) {
    try {
      const detail = JSON.parse(overdueRecord.overdueFeeDetail) as { paidDates?: string[] };
      paidDates = detail.paidDates ?? [];
    } catch {
      paidDates = [];
    }
  }

  const result = calculateRealtimeRepayment({
    principal,
    channel,
    upfrontFeeRate,
    tiers,
    overdueConfig,
    startTime: new Date(disbursedAt),
    dueDate,
    currentTime: now,
    paidDates,
    normalInterestCapitalized,
    fixedFeeAmount,
    netDisbursementAmount: netDisbursementAmount ?? Number(application.disbursement.netAmount),
  });
  const frozenPayableAmount = getFrozenPayableAmount(repaymentFreeze);
  const frozenAt = getInterestFrozenAt(repaymentFreeze);
  const interestPaused = Boolean(repaymentFreeze && frozenPayableAmount != null);
  const displayRepaymentAmount = interestPaused ? frozenPayableAmount! : result.repaymentAmount;
  const displayTotalRepayment = interestPaused ? frozenPayableAmount! : result.totalRepayment;

  return NextResponse.json({
    applicationId: id,
    applicationNo: application.applicationNo,
    customer: {
      ...application.customer,
      weeklyInterestRateOverride:
        application.customer.weeklyInterestRateOverride != null
          ? Number(application.customer.weeklyInterestRateOverride)
          : null,
    },
    productName: application.product.name,
    channel: result.channel,
    principal: result.principal,
    netDisbursement: result.netDisbursement,
    startTime: result.startTime.toISOString(),
    dueDate: dueDate.toISOString(),
    currentTime: result.currentTime.toISOString(),
    remainingToDueMs: dueDate.getTime() - now.getTime(),
    elapsedMs: result.elapsedMs,
    elapsedDays: result.elapsedDays,
    elapsedFormatted: result.elapsedFormatted,
    currentTier: result.currentTier,
    tierIndex: result.tierIndex,
    tiers: result.tiers,
    repaymentAmount: displayRepaymentAmount,
    feeAmount: result.feeAmount,
    isOverdue: result.isOverdue,
    overdueDays: result.overdueDays,
    overduePenalty: result.overduePenalty,
    todayInterest: result.todayInterest,
    totalRepayment: displayTotalRepayment,
    liveTotalRepayment: result.totalRepayment,
    interestPaused,
    frozenPayableAmount,
    frozenAt: frozenAt?.toISOString() ?? null,
    frozenRepaymentNo: repaymentFreeze?.repaymentNo ?? null,
    frozenRepaymentStatus: repaymentFreeze?.status ?? null,
    dailyRecords: result.dailyRecords,
  });
}
