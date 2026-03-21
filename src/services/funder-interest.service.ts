import { prisma } from "@/lib/prisma";

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
  earningSummary: EarningPeriod[];
  upcomingSettlements: UpcomingSettlement[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function diffDays(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

export class FunderInterestService {
  static async getEarnings(funderId: string): Promise<FunderEarnings> {
    const funder = await prisma.funder.findUniqueOrThrow({
      where: { id: funderId },
      include: {
        accounts: { where: { isActive: true } },
        withdrawalRequests: { where: { status: { in: ["APPROVED", "PENDING"] } } },
      },
    });

    const totalDeposited = funder.accounts.reduce((sum, account) => sum + Number(account.totalInflow), 0);
    const totalBalance = funder.accounts.reduce((sum, account) => sum + Number(account.balance), 0);
    const totalWithdrawn = funder.withdrawalRequests
      .filter((item) => item.status === "APPROVED")
      .reduce((sum, item) => sum + Number(item.amount), 0);

    const accountIds = funder.accounts.map((account) => account.id);
    const activeDisbursements = accountIds.length
      ? await prisma.disbursement.findMany({
          where: {
            fundAccountId: { in: accountIds },
            status: { in: ["PAID", "CONFIRMED"] },
          },
          select: {
            id: true,
            applicationId: true,
            disbursementNo: true,
            netAmount: true,
            disbursedAt: true,
            application: {
              select: {
                customer: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: { disbursedAt: "desc" },
        })
      : [];

    const applicationIds = activeDisbursements.map((item) => item.applicationId);
    const activePlans = applicationIds.length
      ? await prisma.repaymentPlan.findMany({
          where: {
            applicationId: { in: applicationIds },
            status: "ACTIVE",
          },
          select: {
            applicationId: true,
            scheduleItems: {
              where: { status: { in: ["PENDING", "PARTIAL"] } },
              orderBy: { dueDate: "asc" },
              select: {
                dueDate: true,
                totalDue: true,
                remaining: true,
              },
              take: 1,
            },
          },
        })
      : [];

    const planMap = new Map(
      activePlans.map((plan) => [plan.applicationId, plan.scheduleItems[0] || null])
    );

    const totalDeployed = activeDisbursements.reduce((sum, item) => sum + Number(item.netAmount), 0);
    const idleFunds = totalBalance;
    const now = new Date();

    let accruedInterest = 0;
    let withdrawableInterest = 0;
    let withdrawablePrincipal = 0;
    const earningSummary: EarningPeriod[] = [];
    const upcomingSettlements: UpcomingSettlement[] = [];

    if (funder.cooperationMode === "FIXED_MONTHLY") {
      const monthlyRate = Number(funder.monthlyRate) / 100;

      activeDisbursements.forEach((disbursement) => {
        if (!disbursement.disbursedAt) return;

        const startDate = new Date(disbursement.disbursedAt);
        const daysSince = diffDays(startDate, now);
        const fullCycles = Math.floor(daysSince / 30);
        const principal = Number(disbursement.netAmount);
        const nextSettlementDate = addDays(startDate, (fullCycles + 1) * 30);
        const nextPlanItem = planMap.get(disbursement.applicationId) || null;
        const expectedCollection = nextPlanItem
          ? Number(nextPlanItem.remaining || nextPlanItem.totalDue || 0)
          : 0;
        const perCycleInterest = round2(principal * monthlyRate);

        if (fullCycles >= 1) {
          const earnedInterest = round2(principal * monthlyRate * fullCycles);
          accruedInterest += earnedInterest;
          withdrawableInterest += earnedInterest;

          earningSummary.push({
            periodStart: startDate,
            periodEnd: now,
            principal,
            deployed: principal,
            rate: Number(funder.monthlyRate),
            interest: earnedInterest,
            withdrawable: true,
          });
        } else {
          earningSummary.push({
            periodStart: startDate,
            periodEnd: now,
            principal,
            deployed: principal,
            rate: Number(funder.monthlyRate),
            interest: 0,
            withdrawable: false,
          });
        }

        upcomingSettlements.push({
          disbursementId: disbursement.id,
          disbursementNo: disbursement.disbursementNo,
          applicationId: disbursement.applicationId,
          customerName: disbursement.application.customer?.name ?? "-",
          principal,
          startDate,
          nextSettlementDate,
          nextCustomerDueDate: nextPlanItem?.dueDate ?? null,
          expectedInterest: perCycleInterest,
          expectedCollection,
          status: fullCycles >= 1 ? "withdrawable" : "accruing",
        });
      });

      withdrawablePrincipal = totalBalance;
    } else {
      const weeklyRate = Number(funder.weeklyRate) / 100;
      const profitShareRatio = Number(funder.profitShareRatio || 0);

      const repaymentPlans = applicationIds.length
        ? await prisma.repaymentPlan.findMany({
            where: { applicationId: { in: applicationIds }, status: { not: "SUPERSEDED" } },
            select: {
              applicationId: true,
              repayments: {
                where: { status: { in: ["PAID", "CONFIRMED"] } },
                select: {
                  feePart: true,
                  penaltyPart: true,
                  receivedAt: true,
                },
              },
            },
          })
        : [];

      const feeMap = new Map<
        string,
        { totalFee: number; lastReceivedAt: Date | null }
      >();

      repaymentPlans.forEach((plan) => {
        const current = feeMap.get(plan.applicationId) || { totalFee: 0, lastReceivedAt: null as Date | null };
        plan.repayments.forEach((repayment) => {
          current.totalFee += Number(repayment.feePart) + Number(repayment.penaltyPart);
          if (repayment.receivedAt && (!current.lastReceivedAt || repayment.receivedAt > current.lastReceivedAt)) {
            current.lastReceivedAt = repayment.receivedAt;
          }
        });
        feeMap.set(plan.applicationId, current);
      });

      activeDisbursements.forEach((disbursement) => {
        if (!disbursement.disbursedAt) return;

        const startDate = new Date(disbursement.disbursedAt);
        const daysSince = diffDays(startDate, now);
        const fullCycles = Math.floor(daysSince / 7);
        const principal = Number(disbursement.netAmount);
        const nextSettlementDate = addDays(startDate, (fullCycles + 1) * 7);
        const nextPlanItem = planMap.get(disbursement.applicationId) || null;
        const expectedCollection = nextPlanItem
          ? Number(nextPlanItem.remaining || nextPlanItem.totalDue || 0)
          : 0;

        const realizedFee = feeMap.get(disbursement.applicationId);
        let earnedInterest = 0;

        if (profitShareRatio > 0 && realizedFee && realizedFee.totalFee > 0) {
          earnedInterest = round2(realizedFee.totalFee * profitShareRatio);
          accruedInterest += earnedInterest;
          withdrawableInterest += earnedInterest;
        } else if (fullCycles >= 1) {
          earnedInterest = round2(principal * weeklyRate * fullCycles);
          accruedInterest += earnedInterest;
          withdrawableInterest += earnedInterest;
        }

        const expectedPerCycleInterest =
          profitShareRatio > 0
            ? round2(principal * weeklyRate)
            : round2(principal * weeklyRate);

        earningSummary.push({
          periodStart: startDate,
          periodEnd: realizedFee?.lastReceivedAt || now,
          principal,
          deployed: principal,
          rate: Number(funder.weeklyRate),
          interest: earnedInterest,
          withdrawable: earnedInterest > 0,
        });

        upcomingSettlements.push({
          disbursementId: disbursement.id,
          disbursementNo: disbursement.disbursementNo,
          applicationId: disbursement.applicationId,
          customerName: disbursement.application.customer?.name ?? "-",
          principal,
          startDate,
          nextSettlementDate,
          nextCustomerDueDate: nextPlanItem?.dueDate ?? null,
          expectedInterest: expectedPerCycleInterest,
          expectedCollection,
          status: earnedInterest > 0 ? "withdrawable" : "accruing",
        });
      });

      withdrawablePrincipal = totalBalance;
    }

    const withdrawnInterest = funder.withdrawalRequests
      .filter((item) => item.status === "APPROVED" && item.type === "INTEREST")
      .reduce((sum, item) => sum + Number(item.interestAmount), 0);

    withdrawableInterest = Math.max(0, round2(withdrawableInterest - withdrawnInterest));

    if (funder.riskSharing && Number(funder.riskShareRatio) > 0 && accountIds.length) {
      const overdueDisbursements = await prisma.disbursement.findMany({
        where: {
          fundAccountId: { in: accountIds },
          status: "OVERDUE",
        },
        select: { netAmount: true },
      });

      const overdueTotal = overdueDisbursements.reduce((sum, item) => sum + Number(item.netAmount), 0);
      const riskDeduction = overdueTotal * Number(funder.riskShareRatio);
      withdrawableInterest = Math.max(0, round2(withdrawableInterest - riskDeduction));
    }

    upcomingSettlements.sort((a, b) => a.nextSettlementDate.getTime() - b.nextSettlementDate.getTime());

    return {
      funderId: funder.id,
      funderName: funder.name,
      cooperationMode: funder.cooperationMode,
      totalDeposited: round2(totalDeposited),
      totalDeployed: round2(totalDeployed),
      idleFunds: round2(idleFunds),
      accruedInterest: round2(accruedInterest),
      withdrawableInterest,
      withdrawablePrincipal: round2(withdrawablePrincipal),
      totalWithdrawn: round2(totalWithdrawn),
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
    const funder = await prisma.funder.findUniqueOrThrow({ where: { id: params.funderId } });

    if (funder.withdrawalCooldownDays > 0) {
      const lastApproved = await prisma.funderWithdrawal.findFirst({
        where: { funderId: params.funderId, status: "APPROVED" },
        orderBy: { approvedAt: "desc" },
      });

      if (lastApproved?.approvedAt) {
        const cooldownEnd = addDays(lastApproved.approvedAt, funder.withdrawalCooldownDays);
        if (new Date() < cooldownEnd) {
          const remainDays = Math.ceil((cooldownEnd.getTime() - Date.now()) / DAY_MS);
          throw new Error(`提现冷静期未结束，还需等待 ${remainDays} 天`);
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

    if (params.amount > maxAmount) {
      throw new Error(`可提现金额不足，当前最多可提 €${maxAmount.toFixed(2)}`);
    }

    return prisma.funderWithdrawal.create({
      data: {
        funderId: params.funderId,
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
            accounts: { where: { isActive: true }, take: 1 },
          },
        },
      },
    });

    if (withdrawal.status !== "PENDING") {
      throw new Error("该申请已被处理");
    }

    return prisma.$transaction(async (tx) => {
      await tx.funderWithdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: "APPROVED",
          approvedAt: new Date(),
          approvedBy: adminId,
        },
      });

      const account = withdrawal.funder.accounts[0];
      if (account) {
        const principalPart = Number(withdrawal.amount) - Number(withdrawal.interestAmount);
        if (principalPart > 0) {
          await tx.fundAccount.update({
            where: { id: account.id },
            data: {
              balance: { decrement: principalPart },
              totalOutflow: { increment: principalPart },
            },
          });
        }
      }

      return { ok: true };
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
