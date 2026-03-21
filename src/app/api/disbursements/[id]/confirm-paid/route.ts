import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { recordDisbursementLedger } from "@/services/ledger.service";
import {
  parseTiersFromPricingRules,
  calcNetDisbursement,
  loadFeeConfig,
} from "@/lib/interest-engine";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function genPlanNo() {
  return `RP${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["disbursement:confirm"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const current = await prisma.disbursement.findUnique({
    where: { id },
    include: { application: true },
  });

  if (!current) {
    return NextResponse.json({ error: "放款单不存在" }, { status: 404 });
  }
  if (current.status !== "PENDING") {
    return NextResponse.json({ error: "当前状态不允许确认打款" }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const now = new Date();

    const disbursement = await tx.disbursement.update({
      where: { id },
      data: {
        status: "PAID",
        disbursedAt: now,          // 计时起点
        operatorId: session.sub,
      },
    });

    await tx.loanApplication.update({
      where: { id: disbursement.applicationId },
      data: { status: "DISBURSED" },
    });

    const existingPlan = await tx.repaymentPlan.findFirst({
      where: { applicationId: disbursement.applicationId },
      select: { id: true },
    });

    if (!existingPlan) {
      // 查询产品定价规则（阶梯费率）
      const application = await tx.loanApplication.findUnique({
        where: { id: disbursement.applicationId },
        include: {
          product: {
            include: {
              pricingRules: {
                where: { isActive: true },
                orderBy: { priority: "desc" },
              },
            },
          },
        },
      });

      // 解析费率配置：优先 system_settings + loan override，兼容 PricingRules
      const settingsRows = await tx.systemSetting.findMany();
      const sysMap: Record<string, string | number> = {};
      for (const s of settingsRows) sysMap[s.key] = s.value;

      const loanOverride = null;

      let pricingConfig;
      const pricingRules = application?.product?.pricingRules ?? [];
      if (pricingRules.length > 0) {
        pricingConfig = parseTiersFromPricingRules(pricingRules);
      } else {
        pricingConfig = loadFeeConfig(sysMap, loanOverride);
      }
      const { tiers, overdueConfig, upfrontFeeRate, channel } = pricingConfig;

      const principal = Number(disbursement.amount);
      const netAmount = calcNetDisbursement(principal, upfrontFeeRate, channel);

      // 到期日 = 确认时间 + 7天（标准借款周期）
      const sortedTiers = [...tiers].sort((a, b) => a.maxDays - b.maxDays);
      const maxTierDays = sortedTiers.length > 0
        ? sortedTiers[sortedTiers.length - 1].maxDays
        : 7;
      const dueDate = new Date(now.getTime() + maxTierDays * 24 * 60 * 60 * 1000);

      // 快照规则用于后续实时计算
      const rulesSnapshot = {
        channel,
        upfrontFeeRate,
        tiers: sortedTiers,
        overdueConfig,
        startTime: now.toISOString(),
        dueDate: dueDate.toISOString(),
      };

      // 固定费用（砍头息）
      const upfrontFee = principal - netAmount;

      const plan = await tx.repaymentPlan.create({
        data: {
          planNo: genPlanNo(),
          applicationId: disbursement.applicationId,
          totalPrincipal: principal,
          totalInterest: 0,       // 利息在还款时动态计算
          totalFee: upfrontFee,
          totalPeriods: 1,
          rulesSnapshotJson: JSON.stringify(rulesSnapshot),
          status: "ACTIVE",
        },
      });

      // 创建单期还款计划条目（到期日 = 最大阶梯时间）
      await tx.repaymentScheduleItem.create({
        data: {
          planId: plan.id,
          periodNumber: 1,
          dueDate,
          principal,
          interest: 0,            // 动态计算
          fee: upfrontFee,
          totalDue: principal,    // 至少还本金（实际金额实时算）
          remaining: principal,
          status: "PENDING",
        },
      });
    }

    // 台账记账：放款
    await recordDisbursementLedger(tx, {
      disbursementId: disbursement.id,
      amount: disbursement.amount,
      feeAmount: disbursement.feeAmount,
      customerId: current.application.customerId,
      operatorId: session.sub,
    });

    // 更新资金账户余额
    await tx.fundAccount.update({
      where: { id: disbursement.fundAccountId },
      data: {
        balance: { decrement: disbursement.netAmount },
        totalOutflow: { increment: disbursement.netAmount },
      },
    });

    return disbursement;
  });

  await writeAuditLog({
    userId: session.sub,
    action: "disburse",
    entityType: "disbursement",
    entityId: id,
    oldValue: { status: current.status },
    newValue: { status: result.status, disbursedAt: result.disbursedAt?.toISOString() ?? null },
    changeSummary: "确认已打款，计时开始",
  }).catch((e) => console.error("[AuditLog] confirm-paid", e));

  return NextResponse.json({ id: result.id, status: result.status });
}
