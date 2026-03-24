import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { recordDisbursementLedger } from "@/services/ledger.service";
import { writeFundAccountLedgerEntry } from "@/services/fund-account-ledger.service";
import {
  calcNetDisbursement,
  calcRepaymentAmount,
  loadFeeConfig,
  parseTiersFromPricingRules,
} from "@/lib/interest-engine";
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

    const pendingDisbursement = await tx.disbursement.findUnique({
      where: { id },
      include: {
        application: {
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
        },
      },
    });

    if (!pendingDisbursement) {
      throw new Error("放款单不存在");
    }

    let pricingConfig;
    if (pendingDisbursement.application.product.pricingRules.length > 0) {
      pricingConfig = parseTiersFromPricingRules(pendingDisbursement.application.product.pricingRules);
    } else {
      const settingsRows = await tx.systemSetting.findMany();
      const sysMap: Record<string, string | number> = {};
      for (const setting of settingsRows) sysMap[setting.key] = setting.value;
      pricingConfig = loadFeeConfig(sysMap, null);
    }

    const { tiers, overdueConfig, upfrontFeeRate, channel } = pricingConfig;
    const principal = Number(pendingDisbursement.amount);
    const netAmount = calcNetDisbursement(principal, upfrontFeeRate, channel);
    const upfrontFeeAmount = Number((principal - netAmount).toFixed(2));
    const sortedTiers = [...tiers].sort(
      (a, b) => (a.maxHours ?? a.maxDays * 24) - (b.maxHours ?? b.maxDays * 24)
    );
    const dueTier = sortedTiers[sortedTiers.length - 1] ?? null;
    const dueHours = dueTier ? (dueTier.maxHours ?? dueTier.maxDays * 24) : 7 * 24;
    const dueDate = new Date(now.getTime() + dueHours * 60 * 60 * 1000);
    const dueRepaymentAmount = calcRepaymentAmount(principal, dueTier?.ratePercent ?? 0, channel);
    const deferredFeeAmount = Number((dueRepaymentAmount - principal).toFixed(2));

    const disbursement = await tx.disbursement.update({
      where: { id },
      data: {
        status: "PAID",
        disbursedAt: now,
        operatorId: session.sub,
        feeAmount: upfrontFeeAmount,
        netAmount,
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
      const rulesSnapshot = {
        channel,
        upfrontFeeRate,
        tiers: sortedTiers,
        overdueConfig,
        startTime: now.toISOString(),
        dueDate: dueDate.toISOString(),
      };

      const plan = await tx.repaymentPlan.create({
        data: {
          planNo: genPlanNo(),
          applicationId: disbursement.applicationId,
          totalPrincipal: principal,
          totalInterest: 0,
          totalFee: channel === "UPFRONT_DEDUCTION" ? upfrontFeeAmount : deferredFeeAmount,
          totalPeriods: 1,
          rulesSnapshotJson: JSON.stringify(rulesSnapshot),
          status: "ACTIVE",
        },
      });

      await tx.repaymentScheduleItem.create({
        data: {
          planId: plan.id,
          periodNumber: 1,
          dueDate,
          principal,
          interest: 0,
          fee: channel === "UPFRONT_DEDUCTION" ? upfrontFeeAmount : deferredFeeAmount,
          totalDue: channel === "UPFRONT_DEDUCTION" ? principal : dueRepaymentAmount,
          remaining: channel === "UPFRONT_DEDUCTION" ? principal : dueRepaymentAmount,
          status: "PENDING",
        },
      });
    }

    await recordDisbursementLedger(tx, {
      disbursementId: disbursement.id,
      amount: disbursement.amount,
      feeAmount: disbursement.feeAmount,
      customerId: pendingDisbursement.application.customerId,
      operatorId: session.sub,
    });

    await writeFundAccountLedgerEntry(tx, {
      fundAccountId: disbursement.fundAccountId,
      type: "DISBURSEMENT",
      direction: "DEBIT",
      amount: disbursement.netAmount,
      referenceType: "disbursement",
      referenceId: disbursement.id,
      operatorId: session.sub,
      description: "Loan disbursement paid to customer",
      metadata: {
        applicationId: disbursement.applicationId,
        grossAmount: Number(disbursement.amount),
        feeAmount: Number(disbursement.feeAmount),
        netAmount: Number(disbursement.netAmount),
      },
    });

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
    changeSummary: "确认已打款并同步生成还款规则快照",
  }).catch((error) => console.error("[AuditLog] confirm-paid", error));

  return NextResponse.json({ id: result.id, status: result.status });
}
