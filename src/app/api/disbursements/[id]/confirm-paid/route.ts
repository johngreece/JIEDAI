import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { writeAuditLogInTransaction } from "@/lib/audit";
import { getScopedIdempotencyKey, withIdempotencyResponse } from "@/lib/idempotency";
import {
  formatClientProfileCompletionError,
  getClientProfileCompletion,
} from "@/lib/client-profile";
import { recordDisbursementLedger } from "@/services/ledger.service";
import { writeFundAccountLedgerEntryAndUpdateAccount } from "@/services/fund-account-ledger.service";
import {
  calcNetDisbursement,
  calcRepaymentAmount,
  loadFeeConfig,
  parseTiersFromPricingRules,
} from "@/lib/interest-engine";
import { applyCustomerPricingOverride } from "@/lib/customer-pricing";
import {
  getLoanContractRepaymentComponents,
  resolveLoanContractTerms,
} from "@/lib/loan-contract-terms";
import { requirePermission } from "@/lib/rbac";
import {
  LoanTransitionConflictError,
  transitionLoanApplication,
} from "@/services/loan-transition.service";

export const dynamic = "force-dynamic";

function genPlanNo() {
  return `RP${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["disbursement:confirm"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const idemKey = getScopedIdempotencyKey(req, ["admin", session.sub, "disbursement-confirm-paid", id]);
  return withIdempotencyResponse(idemKey, async () => {

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

  let result;
  try {
    result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const now = new Date();

    const pendingDisbursement = await tx.disbursement.findUnique({
      where: { id },
      include: {
        application: {
          include: {
            customer: {
              select: {
                phone: true,
                address: true,
                taxNumber: true,
                idNumber: true,
                passportNumber: true,
                residencePermitNumber: true,
                residencePermitExpiry: true,
                profileCompletedAt: true,
                weeklyInterestRateOverride: true,
                kyc: {
                  select: {
                    kycType: true,
                    documentUrl: true,
                    status: true,
                    expiresAt: true,
                  },
                },
              },
            },
            product: {
              include: {
                pricingRules: {
                  where: { isActive: true },
                  orderBy: { priority: "desc" },
                },
              },
            },
            contracts: {
              where: { contractType: "MAIN", status: "SIGNED", deletedAt: null },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                variableData: true,
                currency: true,
                basePrincipal: true,
                capitalizedInterestAmount: true,
                contractPrincipal: true,
                legalServiceFee: true,
                feePaymentMode: true,
              },
            },
          },
        },
      },
    });

    if (!pendingDisbursement) {
      throw new Error("放款单不存在");
    }
    if (pendingDisbursement.status !== "PENDING") {
      throw new Error("DISBURSEMENT_STATUS_CHANGED");
    }
    if (pendingDisbursement.application.status !== "CONTRACTED") {
      throw new Error("LOAN_APPLICATION_STATUS_CHANGED");
    }
    const profileCompletion = getClientProfileCompletion(pendingDisbursement.application.customer);
    if (!profileCompletion.profileComplete) {
      throw new Error(formatClientProfileCompletionError(profileCompletion, "客户资料未完善，不能确认打款"));
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
    pricingConfig = applyCustomerPricingOverride(pricingConfig, pendingDisbursement.application.customer);

    const { tiers, overdueConfig } = pricingConfig;
    const signedContract = pendingDisbursement.application.contracts[0] ?? null;
    if (!signedContract) {
      throw new Error("SIGNED_CONTRACT_MISSING");
    }
    const contractTerms = resolveLoanContractTerms(
      signedContract,
      pendingDisbursement.application.amount,
      pricingConfig.channel,
    );
    const usesStructuredContract = contractTerms.source !== "application_fallback";
    const disbursementPrincipal = Number(pendingDisbursement.amount);
    if (
      usesStructuredContract &&
      !new Decimal(disbursementPrincipal).toDecimalPlaces(4).equals(
        new Decimal(contractTerms.basePrincipal).toDecimalPlaces(4),
      )
    ) {
      throw new Error("DISBURSEMENT_CONTRACT_AMOUNT_MISMATCH");
    }

    const principal = usesStructuredContract
      ? contractTerms.contractPrincipal
      : disbursementPrincipal;
    const channel = usesStructuredContract
      ? contractTerms.feePaymentMode
      : pricingConfig.channel;
    const upfrontFeeRate = usesStructuredContract ? 0 : pricingConfig.upfrontFeeRate;
    const netAmount = usesStructuredContract
      ? contractTerms.netDisbursementAmount
      : calcNetDisbursement(principal, upfrontFeeRate, channel);
    // 使用 Decimal 计算费用，避免 JS 浮点 + toFixed 截断导致与 schema Decimal(18,4) 不一致
    const upfrontFeeAmount = usesStructuredContract
      ? contractTerms.upfrontFeeAmount
      : new Decimal(principal)
          .minus(netAmount)
          .toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
          .toNumber();
    const sortedTiers = [...tiers].sort(
      (a, b) => (a.maxHours ?? a.maxDays * 24) - (b.maxHours ?? b.maxDays * 24)
    );
    const dueTier = sortedTiers[sortedTiers.length - 1] ?? null;
    const dueHours = dueTier ? (dueTier.maxHours ?? dueTier.maxDays * 24) : 7 * 24;
    const dueDate = new Date(now.getTime() + dueHours * 60 * 60 * 1000);
    const dueRepaymentAmount = usesStructuredContract
      ? contractTerms.totalPayable
      : calcRepaymentAmount(principal, dueTier?.ratePercent ?? 0, channel);
    const deferredFeeAmount = usesStructuredContract
      ? contractTerms.repayableFeeAmount
      : new Decimal(dueRepaymentAmount)
          .minus(principal)
          .toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
          .toNumber();
    const contractRepaymentComponents = usesStructuredContract
      ? getLoanContractRepaymentComponents(contractTerms)
      : null;

    const claimed = await tx.disbursement.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: "PAID",
        disbursedAt: now,
        operatorId: session.sub,
        feeAmount: upfrontFeeAmount,
        netAmount,
      },
    });
    if (claimed.count !== 1) {
      throw new Error("DISBURSEMENT_STATUS_CHANGED");
    }

    const disbursement = await tx.disbursement.findUniqueOrThrow({ where: { id } });

    await transitionLoanApplication(tx, {
      applicationId: disbursement.applicationId,
      from: pendingDisbursement.application.status,
      to: "DISBURSED",
      action: "CONFIRM_DISBURSEMENT",
      operatorId: session.sub,
      auditAction: "disburse",
      changeSummary: "Disbursement confirmed paid",
      auditNewValue: { disbursementId: disbursement.id },
    });

    const existingPlan = await tx.repaymentPlan.findFirst({
      where: { applicationId: disbursement.applicationId },
      select: { id: true },
    });

    if (!existingPlan) {
      const rulesSnapshot = {
        channel,
        upfrontFeeRate,
        tiers: usesStructuredContract
          ? sortedTiers.map((tier) => ({ ...tier, ratePercent: 0 }))
          : sortedTiers,
        sourcePricingTiers: usesStructuredContract ? sortedTiers : undefined,
        overdueConfig,
        customerPricing: pricingConfig.customerPricing,
        startTime: now.toISOString(),
        dueDate: dueDate.toISOString(),
        normalInterestCapitalized: usesStructuredContract,
        fixedFeeAmount: usesStructuredContract ? deferredFeeAmount : 0,
        netDisbursementAmount: Number(netAmount),
        contractTerms: usesStructuredContract ? contractTerms : undefined,
      };

      const repaymentFeeAmount = usesStructuredContract
        ? deferredFeeAmount
        : channel === "UPFRONT_DEDUCTION"
          ? upfrontFeeAmount
          : deferredFeeAmount;

      const plan = await tx.repaymentPlan.create({
        data: {
          planNo: genPlanNo(),
          applicationId: disbursement.applicationId,
          totalPrincipal: principal,
          totalInterest: 0,
          totalFee: repaymentFeeAmount,
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
          principal: contractRepaymentComponents?.principal ?? principal,
          interest: contractRepaymentComponents?.interest ?? 0,
          fee: repaymentFeeAmount,
          totalDue: usesStructuredContract
            ? dueRepaymentAmount
            : channel === "UPFRONT_DEDUCTION"
              ? principal
              : dueRepaymentAmount,
          remaining: usesStructuredContract
            ? dueRepaymentAmount
            : channel === "UPFRONT_DEDUCTION"
              ? principal
              : dueRepaymentAmount,
          status: "PENDING",
        },
      });
    }

    await recordDisbursementLedger(tx, {
      disbursementId: disbursement.id,
      amount: usesStructuredContract ? principal : disbursement.amount,
      feeAmount: disbursement.feeAmount,
      customerId: pendingDisbursement.application.customerId,
      operatorId: session.sub,
    });

    await writeFundAccountLedgerEntryAndUpdateAccount(tx, {
      fundAccountId: disbursement.fundAccountId,
      type: "DISBURSEMENT",
      direction: "DEBIT",
      amount: disbursement.netAmount,
      totalOutflowDelta: disbursement.netAmount,
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

    await writeAuditLogInTransaction(tx, {
      userId: session.sub,
      action: "disburse",
      entityType: "disbursement",
      entityId: id,
      oldValue: { status: current.status },
      newValue: {
        status: disbursement.status,
        disbursedAt: disbursement.disbursedAt?.toISOString() ?? null,
        principal,
        contractTermsSource: contractTerms.source,
      },
      changeSummary: "确认已打款并同步生成还款规则快照",
    });

    return disbursement;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message === "DISBURSEMENT_STATUS_CHANGED" ||
      message === "LOAN_APPLICATION_STATUS_CHANGED" ||
      message === "DISBURSEMENT_CONTRACT_AMOUNT_MISMATCH" ||
      error instanceof LoanTransitionConflictError
    ) {
      return NextResponse.json({ error: "当前放款单状态已变化，请刷新后重试" }, { status: 409 });
    }
    if (message.startsWith("客户资料未完善")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (message === "SIGNED_CONTRACT_MISSING") {
      return NextResponse.json({ error: "已签主合同缺失，不能确认打款" }, { status: 409 });
    }
    console.error("[disbursement-confirm-paid]", error);
    return NextResponse.json({ error: "确认打款失败" }, { status: 500 });
  }

  const responseBody = { id: result.id, status: result.status };
  return NextResponse.json(responseBody);
  });
}
