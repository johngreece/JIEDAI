import { prisma } from "@/lib/prisma";
import { writeFundAccountLedgerEntry } from "@/services/fund-account-ledger.service";

type WithdrawalType = "PRINCIPAL" | "INTEREST" | "PRINCIPAL_AND_INTEREST";

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
      let nextSettlementDate = addDays(startDate, 30);

      if (funder.cooperationMode === "FIXED_MONTHLY") {
        rate = toNumber(funder.monthlyRate);
        earnedInterest = round2(principal * (rate / 100) * (activeDays / 30));
        const elapsedCycles = Math.floor(activeDays / 30);
        nextSettlementDate = addDays(startDate, (elapsedCycles + 1) * 30);
      } else {
        rate = toNumber(funder.weeklyRate);
        const profitShareRatio = toNumber(funder.profitShareRatio || 0);
        earnedInterest =
          profitShareRatio > 0
            ? round2(realizedIncome * profitShareRatio)
            : round2(principal * (rate / 100) * (activeDays / 7));
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
      const expectedInterest =
        funder.cooperationMode === "FIXED_MONTHLY"
          ? round2(principal * (toNumber(funder.monthlyRate) / 100))
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
      round2(accruedInterest - approvedInterestWithdrawn - pendingInterestAmount - riskDeduction),
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

    return prisma.funderWithdrawal.create({
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
  }

  static async approveWithdrawal(withdrawalId: string, adminId: string) {
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

    return prisma.$transaction(async (tx) => {
      const accounts = await tx.fundAccount.findMany({
        where: {
          funderId: withdrawal.funderId,
          isActive: true,
        },
        orderBy: [{ balance: "desc" }, { createdAt: "asc" }],
      });

      const preferredCandidates = withdrawal.accountId
        ? [
            ...accounts.filter((account) => account.id === withdrawal.accountId),
            ...accounts.filter((account) => account.id !== withdrawal.accountId),
          ]
        : accounts;

      const chosenAccount = preferredCandidates.find(
        (account) => toNumber(account.balance) >= toNumber(withdrawal.amount) - EPSILON,
      );

      if (!chosenAccount) {
        throw new Error("No active fund account has enough available balance for this withdrawal");
      }

      await writeFundAccountLedgerEntry(tx, {
        fundAccountId: chosenAccount.id,
        type: "WITHDRAWAL",
        direction: "DEBIT",
        amount: Number(withdrawal.amount),
        referenceType: "funder_withdrawal",
        referenceId: withdrawal.id,
        operatorId: adminId,
        description: "Funder withdrawal approved",
        metadata: {
          funderId: withdrawal.funderId,
          withdrawalType: withdrawal.type,
          interestAmount: Number(withdrawal.interestAmount),
        },
      });

      await tx.fundAccount.update({
        where: { id: chosenAccount.id },
        data: {
          balance: { decrement: withdrawal.amount },
          totalOutflow: { increment: withdrawal.amount },
        },
      });

      await tx.funderWithdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: "APPROVED",
          accountId: chosenAccount.id,
          approvedAt: new Date(),
          approvedBy: adminId,
        },
      });

      return {
        ok: true,
        accountId: chosenAccount.id,
      };
    });
  }

  static async rejectWithdrawal(withdrawalId: string, reason: string) {
    return prisma.funderWithdrawal.update({
      where: { id: withdrawalId },
      data: {
        status: "REJECTED",
        rejectedAt: new Date(),
        rejectedReason: reason,
      },
    });
  }
}
