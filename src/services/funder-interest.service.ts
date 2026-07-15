import { prisma } from "@/lib/prisma";
import { getNextCalendarMonthBoundary } from "@/lib/calendar-period";
import { orderWithdrawalFundAccountIds } from "@/lib/fund-account-withdrawal";
import { getFunderDisplayRate, resolveFunderRuleMode } from "@/lib/funder-cooperation";
import { writeAuditLogInTransaction } from "@/lib/audit";
import { createProofAttachment } from "@/lib/proof-attachment";
import { writeDebitFundAccountLedgerEntryFromCandidates } from "@/services/fund-account-ledger.service";

type WithdrawalType = "PRINCIPAL" | "INTEREST" | "PRINCIPAL_AND_INTEREST";

type WithdrawalPaymentEvidence = {
  transactionId: string;
  proof: {
    fileName: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
  };
};

interface EarningPeriod {
  periodStart: Date;
  periodEnd: Date;
  principal: number;
  deployed: number;
  rate: number;
  interest: number;
  withdrawable: boolean;
}

interface UpcomingSettlement {
  disbursementId: string;
  disbursementNo: string;
  applicationId: string;
  customerName: string;
  principal: number;
  startDate: Date;
  nextSettlementDate: Date;
  nextCustomerDueDate: Date | null;
  expectedInterest: number;
  expectedCollection: number;
  status: "accruing" | "withdrawable";
}

interface FunderEarnings {
  funderId: string;
  funderName: string;
  cooperationMode: string;
  totalDeposited: number;
  totalDeployed: number;
  idleFunds: number;
  accruedInterest: number;
  withdrawableInterest: number;
  withdrawablePrincipal: number;
  totalWithdrawn: number;
  totalRecoveredPrincipal: number;
  realizedCustomerIncome: number;
  currentBalance: number;
  pendingWithdrawalAmount: number;
  forecast7dInterest: number;
  forecast30dInterest: number;
  forecast7dCollection: number;
  forecast30dCollection: number;
  earningSummary: EarningPeriod[];
  upcomingSettlements: UpcomingSettlement[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const EPSILON = 0.0001;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function diffDaysPrecise(from: Date, to: Date) {
  return Math.max(0, (to.getTime() - from.getTime()) / DAY_MS);
}

function toNumber(value: unknown) {
  return Number(value || 0);
}

function safeDate(value: Date | null | undefined) {
  return value ? new Date(value) : null;
}

function calculateCalendarMonthlyInterest(params: {
  principal: number;
  monthlyRate: number;
  startDate: Date;
  endDate: Date;
}) {
  if (params.endDate <= params.startDate) return 0;

  let total = 0;
  let index = 1;
  let cycleStart = new Date(params.startDate);

  while (cycleStart < params.endDate) {
    const cycleEnd = getNextCalendarMonthBoundary(params.startDate, cycleStart).boundary;
    const effectiveEnd = cycleEnd < params.endDate ? cycleEnd : params.endDate;
    const scheduledDays = diffDaysPrecise(cycleStart, cycleEnd);
    const elapsedDays = diffDaysPrecise(cycleStart, effectiveEnd);

    if (scheduledDays > 0) {
      total += params.principal * (params.monthlyRate / 100) * (elapsedDays / scheduledDays);
    }

    if (params.endDate <= cycleEnd) break;
    cycleStart = cycleEnd;
    index += 1;
    if (index > 600) break;
  }

  return round2(total);
}

export class FunderInterestService {
  static async getEarnings(funderId: string): Promise<FunderEarnings> {
    const funder = await prisma.funder.findUniqueOrThrow({
      where: { id: funderId },
      include: {
        accounts: {
          where: { isActive: true },
          orderBy: [{ balance: "desc" }, { createdAt: "asc" }],
        },
        withdrawalRequests: { where: { status: { in: ["APPROVED", "PENDING"] } } },
      },
    });

    const totalDeposited = funder.accounts.reduce((sum, account) => sum + toNumber(account.totalInflow), 0);
    const currentBalance = funder.accounts.reduce((sum, account) => sum + toNumber(account.balance), 0);
    const totalWithdrawn = funder.withdrawalRequests
      .filter((item) => item.status === "APPROVED")
      .reduce((sum, item) => sum + toNumber(item.amount), 0);
    const approvedInterestWithdrawn = funder.withdrawalRequests
      .filter((item) => item.status === "APPROVED")
      .reduce((sum, item) => sum + toNumber(item.interestAmount), 0);
    const pendingWithdrawalAmount = funder.withdrawalRequests
      .filter((item) => item.status === "PENDING")
      .reduce((sum, item) => sum + toNumber(item.amount), 0);
    const pendingInterestAmount = funder.withdrawalRequests
      .filter((item) => item.status === "PENDING")
      .reduce((sum, item) => sum + toNumber(item.interestAmount), 0);
    const reservedSettlementAmount = await prisma.funderInterestSettlement
      .aggregate({
        where: {
          funderId: funder.id,
          status: { in: ["DUE", "POSTED_BY_PLATFORM", "CONFIRMED_BY_FUNDER"] },
        },
        _sum: { interestAmount: true },
      })
      .then((result) => toNumber(result._sum.interestAmount))
      .catch(() => 0);

    const accountIds = funder.accounts.map((account) => account.id);
    if (accountIds.length === 0) {
      return {
        funderId: funder.id,
        funderName: funder.name,
        cooperationMode: funder.cooperationMode,
        totalDeposited: round2(totalDeposited),
        totalDeployed: 0,
        idleFunds: 0,
        accruedInterest: 0,
        withdrawableInterest: 0,
        withdrawablePrincipal: 0,
        totalWithdrawn: round2(totalWithdrawn),
        totalRecoveredPrincipal: 0,
        realizedCustomerIncome: 0,
        currentBalance: round2(currentBalance),
        pendingWithdrawalAmount: round2(pendingWithdrawalAmount),
        forecast7dInterest: 0,
        forecast30dInterest: 0,
        forecast7dCollection: 0,
        forecast30dCollection: 0,
        earningSummary: [],
        upcomingSettlements: [],
      };
    }

    const now = new Date();
    const funderRule = {
      cooperationMode: funder.cooperationMode,
      monthlyRate: Number(funder.monthlyRate),
      weeklyRate: Number(funder.weeklyRate),
      profitShareRatio: Number(funder.profitShareRatio || 0),
    };
    const funderRuleMode = resolveFunderRuleMode(funderRule);
    const funderDisplayRate = getFunderDisplayRate(funderRule);

    const allDisbursements = await prisma.disbursement.findMany({
      where: {
        fundAccountId: { in: accountIds },
        status: { in: ["PAID", "CONFIRMED"] },
        application: {
          status: { not: "REJECTED" },
        },
      },
      select: {
        id: true,
        applicationId: true,
        disbursementNo: true,
        fundAccountId: true,
        netAmount: true,
        disbursedAt: true,
        application: {
          select: {
            status: true,
            customer: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { disbursedAt: "desc" },
    });

    const applicationIds = allDisbursements.map((item) => item.applicationId);

    const [repaymentPlans, overdueAgg] = await Promise.all([
      applicationIds.length
        ? prisma.repaymentPlan.findMany({
            where: {
              applicationId: { in: applicationIds },
              status: { not: "SUPERSEDED" },
            },
            select: {
              applicationId: true,
              status: true,
              scheduleItems: {
                where: { status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } },
                orderBy: { dueDate: "asc" },
                select: {
                  id: true,
                  dueDate: true,
                  totalDue: true,
                  remaining: true,
                  interest: true,
                  fee: true,
                  status: true,
                },
                take: 1,
              },
              repayments: {
                where: { status: "CONFIRMED" },
                select: {
                  amount: true,
                  principalPart: true,
                  interestPart: true,
                  feePart: true,
                  penaltyPart: true,
                  receivedAt: true,
                },
                orderBy: { receivedAt: "asc" },
              },
            },
          })
        : Promise.resolve([]),
      applicationIds.length
        ? prisma.overdueRecord.aggregate({
            where: {
              applicationId: { in: applicationIds },
              status: "OVERDUE",
            },
            _sum: { overdueAmount: true },
          })
        : Promise.resolve({ _sum: { overdueAmount: 0 } }),
    ]);

    const planMap = new Map(
      repaymentPlans.map((plan) => [plan.applicationId, plan]),
    );

    const activeDisbursements = allDisbursements.filter(
      (item) => !["SETTLED", "COMPLETED"].includes(item.application.status),
    );

    const cashAvailable = Math.max(0, round2(currentBalance - pendingWithdrawalAmount));
    const earningSummary: EarningPeriod[] = [];
    const upcomingSettlements: UpcomingSettlement[] = [];

    let accruedInterest = 0;
    let totalRecoveredPrincipal = 0;
    let realizedCustomerIncome = 0;
    let totalDeployed = 0;

    for (const disbursement of allDisbursements) {
      if (!disbursement.disbursedAt) continue;

      const plan = planMap.get(disbursement.applicationId);
      const repayments = plan?.repayments ?? [];
      const principal = toNumber(disbursement.netAmount);
      const recoveredPrincipal = repayments.reduce(
        (sum, item) => sum + toNumber(item.principalPart),
        0,
      );
      const realizedIncome = repayments.reduce(
        (sum, item) =>
          sum +
          toNumber(item.interestPart) +
          toNumber(item.feePart) +
          toNumber(item.penaltyPart),
        0,
      );

      totalRecoveredPrincipal += recoveredPrincipal;
      realizedCustomerIncome += realizedIncome;

      const outstandingPrincipal = Math.max(0, round2(principal - recoveredPrincipal));
      totalDeployed += outstandingPrincipal;

      const startDate = new Date(disbursement.disbursedAt);
      const settledByPrincipal = outstandingPrincipal <= EPSILON;
      const lastReceivedAt = safeDate(repayments[repayments.length - 1]?.receivedAt);
      const endDate =
        settledByPrincipal && lastReceivedAt
          ? lastReceivedAt
          : now;
      const activeDays = diffDaysPrecise(startDate, endDate);

      let earnedInterest = 0;
      let rate = 0;
      let nextSettlementDate = addDays(startDate, 7);

      if (funderRuleMode === "FIXED_MONTHLY") {
        rate = toNumber(funder.monthlyRate);
        earnedInterest = calculateCalendarMonthlyInterest({
          principal,
          monthlyRate: rate,
          startDate,
          endDate,
        });
        nextSettlementDate = getNextCalendarMonthBoundary(startDate, endDate).boundary;
      } else if (funderRuleMode === "PROFIT_SHARE") {
        const profitShareRatio = toNumber(funder.profitShareRatio || 0);
        rate = funderDisplayRate;
        earnedInterest = round2(realizedIncome * profitShareRatio);
        const elapsedCycles = Math.floor(activeDays / 7);
        nextSettlementDate = addDays(startDate, (elapsedCycles + 1) * 7);
      } else {
        rate = toNumber(funder.weeklyRate);
        earnedInterest = round2(principal * (rate / 100) * (activeDays / 7));
        const elapsedCycles = Math.floor(activeDays / 7);
        nextSettlementDate = addDays(startDate, (elapsedCycles + 1) * 7);
      }

      accruedInterest += earnedInterest;

      earningSummary.push({
        periodStart: startDate,
        periodEnd: endDate,
        principal,
        deployed: outstandingPrincipal,
        rate,
        interest: earnedInterest,
        withdrawable: earnedInterest > 0,
      });

      if (["SETTLED", "COMPLETED"].includes(disbursement.application.status)) {
        continue;
      }

      const nextPlanItem = plan?.scheduleItems?.[0] || null;
      const expectedCollection = nextPlanItem
        ? toNumber(nextPlanItem.remaining || nextPlanItem.totalDue || 0)
        : 0;
      const expectedCustomerIncome = nextPlanItem
        ? toNumber(nextPlanItem.interest) + toNumber(nextPlanItem.fee)
        : 0;
      const expectedInterest =
        funderRuleMode === "FIXED_MONTHLY"
          ? round2(principal * (toNumber(funder.monthlyRate) / 100))
          : funderRuleMode === "PROFIT_SHARE"
            ? round2(expectedCustomerIncome * toNumber(funder.profitShareRatio || 0))
            : round2(principal * (toNumber(funder.weeklyRate) / 100));

      upcomingSettlements.push({
        disbursementId: disbursement.id,
        disbursementNo: disbursement.disbursementNo,
        applicationId: disbursement.applicationId,
        customerName: disbursement.application.customer?.name ?? "-",
        principal: outstandingPrincipal,
        startDate,
        nextSettlementDate,
        nextCustomerDueDate: nextPlanItem?.dueDate ?? null,
        expectedInterest,
        expectedCollection,
        status: earnedInterest > 0 ? "withdrawable" : "accruing",
      });
    }

    const riskDeduction =
      funder.riskSharing && toNumber(funder.riskShareRatio) > 0
        ? round2(toNumber(overdueAgg._sum.overdueAmount) * toNumber(funder.riskShareRatio))
        : 0;

    let withdrawableInterest = Math.max(
      0,
      round2(accruedInterest - approvedInterestWithdrawn - pendingInterestAmount - reservedSettlementAmount - riskDeduction),
    );
    withdrawableInterest = Math.min(withdrawableInterest, cashAvailable);

    const withdrawablePrincipal = Math.max(0, round2(cashAvailable - withdrawableInterest));
    const idleFunds = cashAvailable;
    const in7Days = addDays(now, 7);
    const in30Days = addDays(now, 30);

    upcomingSettlements.sort((a, b) => a.nextSettlementDate.getTime() - b.nextSettlementDate.getTime());

    const forecast7dInterest = round2(
      upcomingSettlements
        .filter((item) => item.nextSettlementDate <= in7Days)
        .reduce((sum, item) => sum + item.expectedInterest, 0),
    );
    const forecast30dInterest = round2(
      upcomingSettlements
        .filter((item) => item.nextSettlementDate <= in30Days)
        .reduce((sum, item) => sum + item.expectedInterest, 0),
    );
    const forecast7dCollection = round2(
      upcomingSettlements
        .filter((item) => item.nextCustomerDueDate && item.nextCustomerDueDate <= in7Days)
        .reduce((sum, item) => sum + item.expectedCollection, 0),
    );
    const forecast30dCollection = round2(
      upcomingSettlements
        .filter((item) => item.nextCustomerDueDate && item.nextCustomerDueDate <= in30Days)
        .reduce((sum, item) => sum + item.expectedCollection, 0),
    );

    return {
      funderId: funder.id,
      funderName: funder.name,
      cooperationMode: funder.cooperationMode,
      totalDeposited: round2(totalDeposited),
      totalDeployed: round2(totalDeployed),
      idleFunds: round2(idleFunds),
      accruedInterest: round2(accruedInterest),
      withdrawableInterest: round2(withdrawableInterest),
      withdrawablePrincipal: round2(withdrawablePrincipal),
      totalWithdrawn: round2(totalWithdrawn),
      totalRecoveredPrincipal: round2(totalRecoveredPrincipal),
      realizedCustomerIncome: round2(realizedCustomerIncome),
      currentBalance: round2(currentBalance),
      pendingWithdrawalAmount: round2(pendingWithdrawalAmount),
      forecast7dInterest,
      forecast30dInterest,
      forecast7dCollection,
      forecast30dCollection,
      earningSummary,
      upcomingSettlements,
    };
  }

  static async requestWithdrawal(params: {
    funderId: string;
    amount: number;
    type: WithdrawalType;
    includeInterest: boolean;
    remark?: string;
  }) {
    const earnings = await this.getEarnings(params.funderId);
    const funder = await prisma.funder.findUniqueOrThrow({
      where: { id: params.funderId },
      include: {
        accounts: {
          where: { isActive: true },
          orderBy: [{ balance: "desc" }, { createdAt: "asc" }],
        },
      },
    });

    if (funder.withdrawalCooldownDays > 0) {
      const lastApproved = await prisma.funderWithdrawal.findFirst({
        where: { funderId: params.funderId, status: "APPROVED" },
        orderBy: { approvedAt: "desc" },
      });

      if (lastApproved?.approvedAt) {
        const cooldownEnd = addDays(lastApproved.approvedAt, funder.withdrawalCooldownDays);
        if (new Date() < cooldownEnd) {
          const remainDays = Math.ceil((cooldownEnd.getTime() - Date.now()) / DAY_MS);
          throw new Error(`Withdrawal cooldown is still active for ${remainDays} more day(s)`);
        }
      }
    }

    let maxAmount = 0;
    let interestAmount = 0;

    if (params.type === "INTEREST") {
      maxAmount = earnings.withdrawableInterest;
      interestAmount = Math.min(params.amount, maxAmount);
    } else if (params.type === "PRINCIPAL") {
      maxAmount = earnings.withdrawablePrincipal;
      interestAmount = 0;
    } else {
      maxAmount = earnings.withdrawablePrincipal + earnings.withdrawableInterest;
      interestAmount = Math.min(earnings.withdrawableInterest, params.amount);
    }

    if (params.amount > maxAmount + EPSILON) {
      throw new Error(`Insufficient withdrawable amount. Maximum available is ${maxAmount.toFixed(2)}`);
    }

    const preferredAccount = funder.accounts.find((account) => toNumber(account.balance) >= params.amount)
      ?? funder.accounts[0]
      ?? null;

    return prisma.$transaction(
      async (tx) => {
        const claimed = await tx.funder.updateMany({
          where: { id: params.funderId, updatedAt: funder.updatedAt },
          data: { updatedAt: new Date() },
        });

        if (claimed.count !== 1) {
          throw new Error("Funder balance changed, please refresh and submit again");
        }

        return tx.funderWithdrawal.create({
          data: {
            funderId: params.funderId,
            accountId: preferredAccount?.id ?? null,
            amount: params.amount,
            type: params.type,
            includeInterest: params.includeInterest,
            interestAmount,
            remark: params.remark,
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
  }

  static async approveWithdrawal(
    withdrawalId: string,
    adminId: string,
    evidence: WithdrawalPaymentEvidence,
  ) {
    if (!evidence.transactionId.trim() || !evidence.proof.fileUrl.trim()) {
      throw new Error("WITHDRAWAL_BANK_EVIDENCE_REQUIRED");
    }

    const withdrawal = await prisma.funderWithdrawal.findUniqueOrThrow({
      where: { id: withdrawalId },
      include: {
        funder: {
          include: {
            accounts: {
              where: { isActive: true },
              orderBy: [{ balance: "desc" }, { createdAt: "asc" }],
            },
          },
        },
      },
    });

    if (withdrawal.status !== "PENDING") {
      throw new Error("This withdrawal request has already been processed");
    }

    if (withdrawal.funder.withdrawalCooldownDays > 0) {
      const lastApproved = await prisma.funderWithdrawal.findFirst({
        where: {
          funderId: withdrawal.funderId,
          status: "APPROVED",
          id: { not: withdrawal.id },
        },
        orderBy: { approvedAt: "desc" },
      });

      if (lastApproved?.approvedAt) {
        const cooldownEnd = addDays(lastApproved.approvedAt, withdrawal.funder.withdrawalCooldownDays);
        if (new Date() < cooldownEnd) {
          const remainDays = Math.ceil((cooldownEnd.getTime() - Date.now()) / DAY_MS);
          throw new Error(
            `Cannot approve: funder is still within withdrawal cooldown (${remainDays} day(s) remaining)`,
          );
        }
      }
    }

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM funders WHERE id = ${withdrawal.funderId} FOR UPDATE
      `;

      if (withdrawal.funder.withdrawalCooldownDays > 0) {
        const latestApproved = await tx.funderWithdrawal.findFirst({
          where: {
            funderId: withdrawal.funderId,
            status: "APPROVED",
            id: { not: withdrawal.id },
          },
          orderBy: [{ approvedAt: "desc" }, { id: "desc" }],
        });

        if (latestApproved?.approvedAt) {
          const cooldownEnd = addDays(latestApproved.approvedAt, withdrawal.funder.withdrawalCooldownDays);
          if (new Date() < cooldownEnd) {
            const remainDays = Math.ceil((cooldownEnd.getTime() - Date.now()) / DAY_MS);
            throw new Error(
              `Cannot approve: funder is still within withdrawal cooldown (${remainDays} day(s) remaining)`,
            );
          }
        }
      }

      const accounts = await tx.fundAccount.findMany({
        where: {
          funderId: withdrawal.funderId,
          isActive: true,
        },
        orderBy: [{ balance: "desc" }, { createdAt: "asc" }],
      });

      const candidateFundAccountIds = orderWithdrawalFundAccountIds(accounts, withdrawal.accountId);
      if (candidateFundAccountIds.length === 0) {
        throw new Error("No active fund account has enough available balance for this withdrawal");
      }

      const now = new Date();
      const claimed = await tx.funderWithdrawal.updateMany({
        where: { id: withdrawalId, status: "PENDING" },
        data: {
          status: "APPROVED",
          approvedAt: now,
          approvedBy: adminId,
        },
      });

      if (claimed.count !== 1) {
        throw new Error("This withdrawal request has already been processed");
      }

      const ledgerResult = await writeDebitFundAccountLedgerEntryFromCandidates(tx, {
        candidateFundAccountIds,
        type: "WITHDRAWAL",
        amount: Number(withdrawal.amount),
        referenceType: "funder_withdrawal",
        referenceId: withdrawal.id,
        operatorId: adminId,
        description: "Funder withdrawal approved",
        metadata: {
          funderId: withdrawal.funderId,
          withdrawalType: withdrawal.type,
          interestAmount: Number(withdrawal.interestAmount),
          transactionId: evidence.transactionId,
        },
      });

      const payingAccount = accounts.find((account) => account.id === ledgerResult.fundAccountId);
      if (!payingAccount) {
        throw new Error("WITHDRAWAL_PAYMENT_ACCOUNT_MISSING");
      }

      const duplicateTransaction = await tx.funderWithdrawal.findFirst({
        where: {
          id: { not: withdrawal.id },
          accountId: ledgerResult.fundAccountId,
          transactionId: evidence.transactionId,
        },
        select: { id: true },
      });
      if (duplicateTransaction) {
        throw new Error("WITHDRAWAL_TRANSACTION_ID_DUPLICATE");
      }

      await tx.funderWithdrawal.update({
        where: { id: withdrawal.id },
        data: {
          accountId: ledgerResult.fundAccountId,
          transactionId: evidence.transactionId,
          payerBank: payingAccount.bankName,
          payerAccount: payingAccount.accountNo,
        },
      });

      const proofAttachment = await createProofAttachment(tx, {
        entityType: "funder_withdrawal",
        entityId: withdrawal.id,
        fileName: evidence.proof.fileName,
        fileUrl: evidence.proof.fileUrl,
        fileSize: evidence.proof.fileSize,
        mimeType: evidence.proof.mimeType,
        uploadedBy: adminId,
        category: "withdrawal_payment_proof",
      });

      await writeAuditLogInTransaction(tx, {
        userId: adminId,
        action: "approve",
        entityType: "funder_withdrawal",
        entityId: withdrawal.id,
        oldValue: {
          status: withdrawal.status,
          amount: Number(withdrawal.amount),
          funderId: withdrawal.funderId,
        },
        newValue: {
          status: "APPROVED",
          accountId: ledgerResult.fundAccountId,
          transactionId: evidence.transactionId,
          payerBank: payingAccount.bankName,
          payerAccount: payingAccount.accountNo,
          proofAttachmentId: proofAttachment.id,
          balanceAfter: ledgerResult.balanceAfter,
        },
        changeSummary: "Confirm funder withdrawal payment and debit fund account",
      });

      return {
        ok: true,
        accountId: ledgerResult.fundAccountId,
        funderId: withdrawal.funderId,
        withdrawalId: withdrawal.id,
        amount: Number(withdrawal.amount),
        interestAmount: Number(withdrawal.interestAmount),
        type: withdrawal.type,
        transactionId: evidence.transactionId,
        payerBank: payingAccount.bankName,
        payerAccount: payingAccount.accountNo,
        proofAttachment,
      };
    }, { isolationLevel: "Serializable" });
  }

  static async rejectWithdrawal(withdrawalId: string, adminId: string, reason: string) {
    return prisma.$transaction(
      async (tx) => {
        const claimed = await tx.funderWithdrawal.updateMany({
          where: { id: withdrawalId, status: "PENDING" },
          data: {
            status: "REJECTED",
            rejectedAt: new Date(),
            rejectedReason: reason,
          },
        });

        if (claimed.count !== 1) {
          throw new Error("This withdrawal request has already been processed");
        }

        const rejected = await tx.funderWithdrawal.findUniqueOrThrow({
          where: { id: withdrawalId },
        });
        await writeAuditLogInTransaction(tx, {
          userId: adminId,
          action: "reject",
          entityType: "funder_withdrawal",
          entityId: withdrawalId,
          oldValue: { status: "PENDING" },
          newValue: { status: rejected.status, rejectedReason: reason },
          changeSummary: "Reject funder withdrawal request",
        });
        return rejected;
      },
      { isolationLevel: "Serializable" },
    );
  }
}
