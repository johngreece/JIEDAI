/**
 * GET /api/loan-applications/:id/realtime
 * 实时计算当前还款金额（基于小时窗口费率 + 逾期简单利息）
 *
 * 返回：当前阶梯、应还金额、经过天数、逾期详情等
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const application = await prisma.loanApplication.findUnique({
    where: { id },
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
      customer: { select: { id: true, name: true, phone: true } },
    },
  });

  if (!application) {
    return NextResponse.json({ error: "借款申请不存在" }, { status: 404 });
  }

  if (!application.disbursement || application.disbursement.status !== "PAID") {
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
    where: { applicationId: id, status: "ACTIVE" },
    select: { rulesSnapshotJson: true },
  });
  const overdueRecord = await prisma.overdueRecord.findFirst({
    where: { applicationId: id, status: "OVERDUE" },
    orderBy: { createdAt: "desc" },
    select: { overdueFeeDetail: true },
  });

  let tiers: RepaymentTier[] = DEFAULT_TIERS;
  let overdueConfig: OverdueConfig = DEFAULT_OVERDUE;
  let upfrontFeeRate = DEFAULT_UPFRONT_FEE_RATE;
  let channel: ChannelType = "UPFRONT_DEDUCTION";
  let dueDate: Date | null = null;

  if (plan?.rulesSnapshotJson) {
    try {
      const snap = JSON.parse(plan.rulesSnapshotJson);
      if (snap.tiers) tiers = snap.tiers;
      if (snap.overdueConfig) overdueConfig = snap.overdueConfig;
      if (snap.upfrontFeeRate != null) upfrontFeeRate = snap.upfrontFeeRate;
      if (snap.channel) channel = snap.channel;
      if (snap.dueDate) dueDate = new Date(snap.dueDate);
    } catch {
      // 快照解析失败
    }
  }

  // 如果快照中没有配置，从系统设置或产品定价规则解析
  if (!plan?.rulesSnapshotJson) {
    if (application.product.pricingRules.length > 0) {
      const parsed = parseTiersFromPricingRules(application.product.pricingRules);
      tiers = parsed.tiers;
      overdueConfig = parsed.overdueConfig;
      upfrontFeeRate = parsed.upfrontFeeRate;
      channel = parsed.channel;
    } else {
      const settingsRows = await prisma.systemSetting.findMany();
      const sysMap: Record<string, string | number> = {};
      for (const s of settingsRows) sysMap[s.key] = s.value;
      const loanOverride = null;
      const parsed = loadFeeConfig(sysMap, loanOverride);
      tiers = parsed.tiers;
      overdueConfig = parsed.overdueConfig;
      upfrontFeeRate = parsed.upfrontFeeRate;
      channel = parsed.channel;
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

  const principal = Number(application.amount);
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
  });

  return NextResponse.json({
    applicationId: id,
    applicationNo: application.applicationNo,
    customer: application.customer,
    productName: application.product.name,
    channel: result.channel,
    principal: result.principal,
    netDisbursement: result.netDisbursement,
    startTime: result.startTime.toISOString(),
    currentTime: result.currentTime.toISOString(),
    elapsedMs: result.elapsedMs,
    elapsedDays: result.elapsedDays,
    elapsedFormatted: result.elapsedFormatted,
    currentTier: result.currentTier,
    tierIndex: result.tierIndex,
    tiers: result.tiers,
    repaymentAmount: result.repaymentAmount,
    feeAmount: result.feeAmount,
    isOverdue: result.isOverdue,
    overdueDays: result.overdueDays,
    overduePenalty: result.overduePenalty,
    todayInterest: result.todayInterest,
    totalRepayment: result.totalRepayment,
    dailyRecords: result.dailyRecords,
  });
}
