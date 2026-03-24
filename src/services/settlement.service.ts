import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";

export interface SettlementPeriod {
  start: Date;
  end: Date;
}

export interface SettlementSummary {
  period: { start: string; end: string };
  disbursedCount: number;
  disbursedAmount: string;
  disbursedFee: string;
  disbursedNet: string;
  repaidCount: number;
  repaidAmount: string;
  repaidPrincipal: string;
  repaidInterest: string;
  repaidFee: string;
  repaidPenalty: string;
  overdueCount: number;
  overdueAmount: string;
  overduePenalty: string;
  totalIncome: string;
  totalOutflow: string;
  netProfit: string;
  platformGrossProfit: string;
  platformNetProfit: string;
  capitalInjected: string;
  funderWithdrawalAmount: string;
  funderSettlementCost: string;
  capitalRecovery: string;
  grossROI: string;
  netROI: string;
  periodNetCashflow: string;
  capitalOccupancy: string;
  capitalReleased: string;
  currentOutstandingBalance: string;
  funderBalance: string;
  funderProfit: string;
  ledgerDebitTotal: string;
  ledgerCreditTotal: string;
  fundJournalCreditTotal: string;
  fundJournalDebitTotal: string;
}

export interface DailyBreakdown {
  date: string;
  disbursedAmount: number;
  disbursedFee: number;
  repaidAmount: number;
  repaidProfit: number;
  netCashflow: number;
}

export interface CustomerSettlement {
  customerId: string;
  customerName: string;
  phone: string;
  totalBorrowed: number;
  totalRepaid: number;
  outstandingBalance: number;
  profitFromCustomer: number;
  loanCount: number;
  isOverdue: boolean;
}

function toNumber(value: unknown) {
  return Number(value || 0);
}

function toMoney(value: number) {
  return new Decimal(value || 0).toFixed(2);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const EPSILON = 0.0001;

function overlapDays(startA: Date, endA: Date, startB: Date, endB: Date) {
  const start = Math.max(startA.getTime(), startB.getTime());
  const end = Math.min(endA.getTime(), endB.getTime());
  return Math.max(0, (end - start) / DAY_MS);
}

async function calculateFunderShareRows(period: SettlementPeriod) {
  const { start, end } = period;
  const funders = await prisma.funder.findMany({
    where: { isActive: true },
    include: {
      accounts: { where: { isActive: true } },
      profitShares: {
        where: { periodStart: start, periodEnd: end },
        take: 1,
      },
    },
  });

  if (!funders.length) {
    return [];
  }

  const accountIdToFunder = new Map<string, typeof funders[number]>();
  const accountIds: string[] = [];
  for (const funder of funders) {
    for (const account of funder.accounts) {
      accountIds.push(account.id);
      accountIdToFunder.set(account.id, funder);
    }
  }

  if (!accountIds.length) {
    return funders.map((funder) => ({
      funderId: funder.id,
      funderName: funder.name,
      contactPerson: funder.contactPerson,
      totalBalance: 0,
      totalInflow: 0,
      shareRatioNumber: toNumber(funder.profitShareRatio || 0),
      shareRatioLabel: `${(toNumber(funder.profitShareRatio || 0) * 100).toFixed(1)}%`,
      shareAmountNumber: 0,
      periodIncomeNumber: 0,
      existingSettlement: funder.profitShares[0]
        ? {
            id: funder.profitShares[0].id,
            status: funder.profitShares[0].status,
            settledAt: funder.profitShares[0].settledAt,
          }
        : null,
    }));
  }

  const disbursements = await prisma.disbursement.findMany({
    where: {
      fundAccountId: { in: accountIds },
      status: { in: ["PAID", "CONFIRMED"] },
      disbursedAt: { lt: end },
    },
    select: {
      fundAccountId: true,
      applicationId: true,
      netAmount: true,
      disbursedAt: true,
    },
  });

  const applicationIds = Array.from(new Set(disbursements.map((item) => item.applicationId)));
  const plans = applicationIds.length
    ? await prisma.repaymentPlan.findMany({
        where: {
          applicationId: { in: applicationIds },
          status: { not: "SUPERSEDED" },
        },
        select: {
          applicationId: true,
          repayments: {
            where: {
              status: "CONFIRMED",
              receivedAt: { lt: end },
            },
            select: {
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
    : [];

  const planMap = new Map(plans.map((plan) => [plan.applicationId, plan]));
  const rows = new Map<
    string,
    {
      funderId: string;
      funderName: string;
      contactPerson: string | null;
      totalBalance: number;
      totalInflow: number;
      shareRatioNumber: number;
      shareRatioLabel: string;
      shareAmountNumber: number;
      periodIncomeNumber: number;
      existingSettlement: { id: string; status: string; settledAt: Date | null } | null;
    }
  >();

  for (const funder of funders) {
    const ratioNumber =
      funder.cooperationMode === "FIXED_MONTHLY"
        ? toNumber(funder.monthlyRate) / 100
        : toNumber(funder.profitShareRatio || 0) > 0
          ? toNumber(funder.profitShareRatio || 0)
          : toNumber(funder.weeklyRate) / 100;

    const ratioLabel =
      funder.cooperationMode === "FIXED_MONTHLY"
        ? `${toNumber(funder.monthlyRate).toFixed(2)}%/30d`
        : toNumber(funder.profitShareRatio || 0) > 0
          ? `${(toNumber(funder.profitShareRatio || 0) * 100).toFixed(1)}%`
          : `${toNumber(funder.weeklyRate).toFixed(2)}%/7d`;

    rows.set(funder.id, {
      funderId: funder.id,
      funderName: funder.name,
      contactPerson: funder.contactPerson,
      totalBalance: funder.accounts.reduce((sum, account) => sum + toNumber(account.balance), 0),
      totalInflow: funder.accounts.reduce((sum, account) => sum + toNumber(account.totalInflow), 0),
      shareRatioNumber: ratioNumber,
      shareRatioLabel: ratioLabel,
      shareAmountNumber: 0,
      periodIncomeNumber: 0,
      existingSettlement: funder.profitShares[0]
        ? {
            id: funder.profitShares[0].id,
            status: funder.profitShares[0].status,
            settledAt: funder.profitShares[0].settledAt,
          }
        : null,
    });
  }

  for (const disbursement of disbursements) {
    if (!disbursement.disbursedAt) continue;

    const funder = accountIdToFunder.get(disbursement.fundAccountId);
    if (!funder) continue;

    const row = rows.get(funder.id);
    if (!row) continue;

    const plan = planMap.get(disbursement.applicationId);
    const repayments = plan?.repayments ?? [];
    const repaymentsInPeriod = repayments.filter(
      (item) => item.receivedAt && item.receivedAt >= start && item.receivedAt < end,
    );

    const periodIncome = repaymentsInPeriod.reduce(
      (sum, item) =>
        sum +
        toNumber(item.interestPart) +
        toNumber(item.feePart) +
        toNumber(item.penaltyPart),
      0,
    );

    if (funder.cooperationMode !== "FIXED_MONTHLY" && toNumber(funder.profitShareRatio || 0) > 0) {
      row.periodIncomeNumber += periodIncome;
      row.shareAmountNumber += periodIncome * toNumber(funder.profitShareRatio || 0);
      continue;
    }

    const recoveredPrincipalBeforeEnd = repayments.reduce(
      (sum, item) => sum + toNumber(item.principalPart),
      0,
    );
    const lastReceivedAt = repayments[repayments.length - 1]?.receivedAt ?? null;
    const principal = toNumber(disbursement.netAmount);
    const isRecovered = recoveredPrincipalBeforeEnd >= principal - EPSILON;
    const effectiveEnd = isRecovered && lastReceivedAt ? new Date(lastReceivedAt) : end;
    const days = overlapDays(new Date(disbursement.disbursedAt), effectiveEnd, start, end);

    if (days <= 0) continue;

    if (funder.cooperationMode === "FIXED_MONTHLY") {
      const shareAmount = principal * (toNumber(funder.monthlyRate) / 100) * (days / 30);
      row.periodIncomeNumber += shareAmount;
      row.shareAmountNumber += shareAmount;
    } else {
      const shareAmount = principal * (toNumber(funder.weeklyRate) / 100) * (days / 7);
      row.periodIncomeNumber += shareAmount;
      row.shareAmountNumber += shareAmount;
    }
  }

  return Array.from(rows.values()).map((row) => ({
    ...row,
    totalBalance: roundNumber(row.totalBalance),
    totalInflow: roundNumber(row.totalInflow),
    shareAmountNumber: roundNumber(row.shareAmountNumber),
    periodIncomeNumber: roundNumber(row.periodIncomeNumber),
  }));
}

function roundNumber(value: number) {
  return Number(new Decimal(value || 0).toDecimalPlaces(2).toString());
}

export class SettlementService {
  static async generateReport(period: SettlementPeriod): Promise<SettlementSummary> {
    const { start, end } = period;

    const [
      disbursementAgg,
      repaymentAgg,
      overdueAgg,
      ledgerDebitAgg,
      ledgerCreditAgg,
      funderAgg,
      outstandingAgg,
      capitalInflowAgg,
      funderWithdrawalAgg,
      fundJournalCreditAgg,
      fundJournalDebitAgg,
      funderShareRows,
    ] = await Promise.all([
      prisma.disbursement.aggregate({
        where: {
          disbursedAt: { gte: start, lt: end },
          status: { in: ["PAID", "CONFIRMED"] },
        },
        _sum: { amount: true, feeAmount: true, netAmount: true },
        _count: true,
      }).catch(() => ({ _sum: { amount: 0, feeAmount: 0, netAmount: 0 }, _count: 0 })),

      prisma.repayment.aggregate({
        where: {
          receivedAt: { gte: start, lt: end },
          status: "CONFIRMED",
        },
        _sum: {
          amount: true,
          principalPart: true,
          interestPart: true,
          feePart: true,
          penaltyPart: true,
        },
        _count: true,
      }).catch(() => ({
        _sum: { amount: 0, principalPart: 0, interestPart: 0, feePart: 0, penaltyPart: 0 },
        _count: 0,
      })),

      prisma.overdueRecord.aggregate({
        where: {
          createdAt: { gte: start, lt: end },
          status: "OVERDUE",
        },
        _sum: { overdueAmount: true, penaltyAmount: true },
        _count: true,
      }).catch(() => ({ _sum: { overdueAmount: 0, penaltyAmount: 0 }, _count: 0 })),

      prisma.ledgerEntry.aggregate({
        where: {
          createdAt: { gte: start, lt: end },
          direction: "DEBIT",
        },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: 0 } })),

      prisma.ledgerEntry.aggregate({
        where: {
          createdAt: { gte: start, lt: end },
          direction: "CREDIT",
        },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: 0 } })),

      prisma.fundAccount.aggregate({
        where: { isActive: true },
        _sum: { balance: true, totalProfit: true },
      }).catch(() => ({ _sum: { balance: 0, totalProfit: 0 } })),

      prisma.repaymentScheduleItem.aggregate({
        where: {
          status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
          plan: { status: "ACTIVE" },
        },
        _sum: { remaining: true },
      }).catch(() => ({ _sum: { remaining: 0 } })),

      prisma.capitalInflow.aggregate({
        where: {
          status: "CONFIRMED",
          inflowDate: { gte: start, lt: end },
        },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: 0 } })),

      prisma.funderWithdrawal.aggregate({
        where: {
          status: "APPROVED",
          approvedAt: { gte: start, lt: end },
        },
        _sum: { amount: true, interestAmount: true },
      }).catch(() => ({ _sum: { amount: 0, interestAmount: 0 } })),

      prisma.fundAccountJournal.aggregate({
        where: {
          createdAt: { gte: start, lt: end },
          direction: "CREDIT",
        },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: 0 } })),

      prisma.fundAccountJournal.aggregate({
        where: {
          createdAt: { gte: start, lt: end },
          direction: "DEBIT",
        },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: 0 } })),

      calculateFunderShareRows(period),
    ]);

    const disbursedAmount = toNumber(disbursementAgg._sum.amount);
    const disbursedFee = toNumber(disbursementAgg._sum.feeAmount);
    const disbursedNet = toNumber(disbursementAgg._sum.netAmount);

    const repaidAmount = toNumber(repaymentAgg._sum.amount);
    const repaidPrincipal = toNumber(repaymentAgg._sum.principalPart);
    const repaidInterest = toNumber(repaymentAgg._sum.interestPart);
    const repaidFee = toNumber(repaymentAgg._sum.feePart);
    const repaidPenalty = toNumber(repaymentAgg._sum.penaltyPart);

    const capitalInjected = toNumber(capitalInflowAgg._sum.amount);
    const funderWithdrawalAmount = toNumber(funderWithdrawalAgg._sum.amount);
    const funderSettlementCost = funderShareRows.reduce(
      (sum, item) => sum + item.shareAmountNumber,
      0,
    );
    const totalIncome = disbursedFee + repaidInterest + repaidFee + repaidPenalty;
    const platformGrossProfit = totalIncome;
    const platformNetProfit = totalIncome - funderSettlementCost;
    const netProfit = platformNetProfit;
    const periodNetCashflow = capitalInjected + repaidAmount - disbursedNet - funderWithdrawalAmount;
    const capitalOccupancy = Math.max(0, disbursedNet - repaidPrincipal);
    const capitalReleased = Math.max(0, repaidPrincipal - disbursedNet);

    const grossRoi = disbursedNet > 0
      ? new Decimal(platformGrossProfit).div(disbursedNet).mul(100).toDecimalPlaces(2).toNumber()
      : 0;
    const netRoi = disbursedNet > 0
      ? new Decimal(platformNetProfit).div(disbursedNet).mul(100).toDecimalPlaces(2).toNumber()
      : 0;

    return {
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      disbursedCount: disbursementAgg._count ?? 0,
      disbursedAmount: toMoney(disbursedAmount),
      disbursedFee: toMoney(disbursedFee),
      disbursedNet: toMoney(disbursedNet),
      repaidCount: repaymentAgg._count ?? 0,
      repaidAmount: toMoney(repaidAmount),
      repaidPrincipal: toMoney(repaidPrincipal),
      repaidInterest: toMoney(repaidInterest),
      repaidFee: toMoney(repaidFee),
      repaidPenalty: toMoney(repaidPenalty),
      overdueCount: overdueAgg._count ?? 0,
      overdueAmount: toMoney(toNumber(overdueAgg._sum.overdueAmount)),
      overduePenalty: toMoney(toNumber(overdueAgg._sum.penaltyAmount)),
      totalIncome: toMoney(totalIncome),
      totalOutflow: toMoney(disbursedNet),
      netProfit: toMoney(netProfit),
      platformGrossProfit: toMoney(platformGrossProfit),
      platformNetProfit: toMoney(platformNetProfit),
      capitalInjected: toMoney(capitalInjected),
      funderWithdrawalAmount: toMoney(funderWithdrawalAmount),
      funderSettlementCost: toMoney(funderSettlementCost),
      capitalRecovery: toMoney(repaidPrincipal),
      grossROI: `${grossRoi}%`,
      netROI: `${netRoi}%`,
      periodNetCashflow: toMoney(periodNetCashflow),
      capitalOccupancy: toMoney(capitalOccupancy),
      capitalReleased: toMoney(capitalReleased),
      currentOutstandingBalance: toMoney(toNumber(outstandingAgg._sum.remaining)),
      funderBalance: toMoney(toNumber(funderAgg._sum.balance)),
      funderProfit: toMoney(toNumber(funderAgg._sum.totalProfit)),
      ledgerDebitTotal: toMoney(toNumber(ledgerDebitAgg._sum.amount)),
      ledgerCreditTotal: toMoney(toNumber(ledgerCreditAgg._sum.amount)),
      fundJournalCreditTotal: toMoney(toNumber(fundJournalCreditAgg._sum.amount)),
      fundJournalDebitTotal: toMoney(toNumber(fundJournalDebitAgg._sum.amount)),
    };
  }

  static async getDailyBreakdown(period: SettlementPeriod): Promise<DailyBreakdown[]> {
    const { start, end } = period;

    const [disbursements, repayments] = await Promise.all([
      prisma.disbursement.findMany({
        where: {
          disbursedAt: { gte: start, lt: end },
          status: { in: ["PAID", "CONFIRMED"] },
        },
        select: {
          disbursedAt: true,
          amount: true,
          feeAmount: true,
          netAmount: true,
        },
        orderBy: { disbursedAt: "asc" },
      }),
      prisma.repayment.findMany({
        where: {
          receivedAt: { gte: start, lt: end },
          status: "CONFIRMED",
        },
        select: {
          receivedAt: true,
          amount: true,
          interestPart: true,
          feePart: true,
          penaltyPart: true,
        },
        orderBy: { receivedAt: "asc" },
      }),
    ]);

    const dayMap = new Map<string, DailyBreakdown>();

    const cursor = new Date(start);
    while (cursor < end) {
      const key = cursor.toISOString().slice(0, 10);
      dayMap.set(key, {
        date: key,
        disbursedAmount: 0,
        disbursedFee: 0,
        repaidAmount: 0,
        repaidProfit: 0,
        netCashflow: 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    for (const item of disbursements) {
      if (!item.disbursedAt) continue;
      const key = item.disbursedAt.toISOString().slice(0, 10);
      const row = dayMap.get(key);
      if (!row) continue;

      row.disbursedAmount += toNumber(item.amount);
      row.disbursedFee += toNumber(item.feeAmount);
      row.netCashflow -= toNumber(item.netAmount);
    }

    for (const item of repayments) {
      if (!item.receivedAt) continue;
      const key = item.receivedAt.toISOString().slice(0, 10);
      const row = dayMap.get(key);
      if (!row) continue;

      row.repaidAmount += toNumber(item.amount);
      row.repaidProfit +=
        toNumber(item.interestPart) +
        toNumber(item.feePart) +
        toNumber(item.penaltyPart);
      row.netCashflow += toNumber(item.amount);
    }

    return Array.from(dayMap.values());
  }

  static async getCustomerSettlement(period: SettlementPeriod): Promise<CustomerSettlement[]> {
    const { start, end } = period;

    const customers = await prisma.customer.findMany({
      where: {
        deletedAt: null,
        OR: [
          { loanApplications: { some: { createdAt: { gte: start, lt: end } } } },
          { ledgerEntries: { some: { createdAt: { gte: start, lt: end } } } },
        ],
      },
      select: {
        id: true,
        name: true,
        phone: true,
      },
    });

    const results: CustomerSettlement[] = [];

    for (const customer of customers) {
      const applicationIds = await prisma.loanApplication.findMany({
        where: { customerId: customer.id },
        select: { id: true },
      }).then((rows) => rows.map((row) => row.id));

      const [disbursementAgg, repaymentAgg, lastLedger, overdueCount, loanCount] = await Promise.all([
        prisma.disbursement.aggregate({
          where: {
            application: { customerId: customer.id },
            disbursedAt: { gte: start, lt: end },
            status: { in: ["PAID", "CONFIRMED"] },
          },
          _sum: { amount: true, feeAmount: true },
        }).catch(() => ({ _sum: { amount: 0, feeAmount: 0 } })),

        prisma.repayment.aggregate({
          where: {
            plan: { applicationId: { in: applicationIds } },
            receivedAt: { gte: start, lt: end },
            status: "CONFIRMED",
          },
          _sum: { amount: true, interestPart: true, feePart: true, penaltyPart: true },
        }).catch(() => ({
          _sum: { amount: 0, interestPart: 0, feePart: 0, penaltyPart: 0 },
        })),

        prisma.ledgerEntry.findFirst({
          where: { customerId: customer.id },
          orderBy: { createdAt: "desc" },
          select: { balanceAfter: true },
        }),

        prisma.overdueRecord.count({
          where: {
            customerId: customer.id,
            status: "OVERDUE",
          },
        }),

        prisma.loanApplication.count({
          where: {
            customerId: customer.id,
            createdAt: { gte: start, lt: end },
          },
        }),
      ]);

      const totalBorrowed = toNumber(disbursementAgg._sum?.amount);
      const totalRepaid = toNumber(repaymentAgg._sum?.amount);
      const profitFromCustomer =
        toNumber(disbursementAgg._sum?.feeAmount) +
        toNumber(repaymentAgg._sum?.interestPart) +
        toNumber(repaymentAgg._sum?.feePart) +
        toNumber(repaymentAgg._sum?.penaltyPart);

      results.push({
        customerId: customer.id,
        customerName: customer.name,
        phone: customer.phone,
        totalBorrowed,
        totalRepaid,
        outstandingBalance: toNumber(lastLedger?.balanceAfter),
        profitFromCustomer,
        loanCount,
        isOverdue: overdueCount > 0,
      });
    }

    results.sort((a, b) => b.profitFromCustomer - a.profitFromCustomer);
    return results;
  }

  static async calculateFunderProfitShare(period: SettlementPeriod) {
    const rows = await calculateFunderShareRows(period);

    return rows.map((row) => ({
      funderId: row.funderId,
      funderName: row.funderName,
      contactPerson: row.contactPerson,
      totalBalance: row.totalBalance,
      totalInflow: row.totalInflow,
      shareRatio: row.shareRatioLabel,
      shareAmount: row.shareAmountNumber.toFixed(2),
      periodTotalInterest: row.periodIncomeNumber.toFixed(2),
      existingSettlement: row.existingSettlement,
    }));
  }

  static async profitMaximizationAnalysis() {
    const [allDisbursements, outstandingAgg] = await Promise.all([
      prisma.disbursement.findMany({
        where: { status: { in: ["PAID", "CONFIRMED"] } },
        select: {
          id: true,
          amount: true,
          feeAmount: true,
          netAmount: true,
          disbursedAt: true,
          applicationId: true,
        },
        orderBy: { disbursedAt: "desc" },
      }),
      prisma.repaymentScheduleItem.aggregate({
        where: {
          status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
          plan: { status: "ACTIVE" },
        },
        _sum: { remaining: true },
      }).catch(() => ({ _sum: { remaining: 0 } })),
    ]);

    const applicationIds = allDisbursements.map((item) => item.applicationId);
    const repaymentPlans = applicationIds.length
      ? await prisma.repaymentPlan.findMany({
          where: { applicationId: { in: applicationIds } },
          select: {
            applicationId: true,
            repayments: {
              where: { status: "CONFIRMED" },
              select: {
                amount: true,
                interestPart: true,
                feePart: true,
                penaltyPart: true,
                receivedAt: true,
              },
            },
          },
        })
      : [];

    const repaymentsByApplication = new Map<string, typeof repaymentPlans[number]["repayments"]>();
    for (const plan of repaymentPlans) {
      const existing = repaymentsByApplication.get(plan.applicationId) || [];
      repaymentsByApplication.set(plan.applicationId, [...existing, ...plan.repayments]);
    }

    let totalCapitalDeployed = 0;
    let totalRevenue = 0;
    let totalPrincipalRecovered = 0;
    let fastRepayCount = 0;
    let slowRepayCount = 0;
    let noRepayCount = 0;
    let fastRevenue = 0;
    let slowRevenue = 0;

    for (const disbursement of allDisbursements) {
      const netAmount = toNumber(disbursement.netAmount);
      const feeAmount = toNumber(disbursement.feeAmount);
      totalCapitalDeployed += netAmount;
      totalRevenue += feeAmount;

      const repayments = repaymentsByApplication.get(disbursement.applicationId) || [];
      if (repayments.length === 0) {
        noRepayCount += 1;
        continue;
      }

      for (const repayment of repayments) {
        const interestRevenue =
          toNumber(repayment.interestPart) +
          toNumber(repayment.feePart) +
          toNumber(repayment.penaltyPart);

        totalRevenue += interestRevenue;
        totalPrincipalRecovered +=
          toNumber(repayment.amount) -
          toNumber(repayment.interestPart) -
          toNumber(repayment.feePart) -
          toNumber(repayment.penaltyPart);

        if (disbursement.disbursedAt && repayment.receivedAt) {
          const hours =
            (new Date(repayment.receivedAt).getTime() - new Date(disbursement.disbursedAt).getTime()) / 3600000;

          if (hours <= 24) {
            fastRepayCount += 1;
            fastRevenue += interestRevenue;
          } else {
            slowRepayCount += 1;
            slowRevenue += interestRevenue;
          }
        }
      }
    }

    const strategies: string[] = [];

    if (totalCapitalDeployed > 0) {
      const annualTurnover = 365 / 7;
      const annualizedRoi = new Decimal(totalRevenue)
        .div(totalCapitalDeployed)
        .mul(annualTurnover)
        .mul(100)
        .toDecimalPlaces(1)
        .toNumber();

      strategies.push(`当前资金年化经营回报约 ${annualizedRoi}% ，应继续压缩回款周期并提高复投速度。`);
    }

    if (allDisbursements.length > 0) {
      const feeBase = allDisbursements.reduce((sum, item) => sum + toNumber(item.amount), 0);
      const feeIncome = allDisbursements.reduce((sum, item) => sum + toNumber(item.feeAmount), 0);
      const avgFeeRate = feeBase > 0
        ? new Decimal(feeIncome).div(feeBase).mul(100).toDecimalPlaces(1).toNumber()
        : 0;

      strategies.push(`平均前置收费率约 ${avgFeeRate}% ，建议继续按客群和回款速度做分层定价。`);
    }

    const totalRepayCount = fastRepayCount + slowRepayCount;
    if (totalRepayCount > 0) {
      const fastPct = ((fastRepayCount / totalRepayCount) * 100).toFixed(0);
      strategies.push(`24 小时内回款占比 ${fastPct}% ，可用早还优惠换更高周转。`);
    }

    if (noRepayCount > 0) {
      strategies.push(`当前仍有 ${noRepayCount} 笔未形成有效回款，需持续盯逾期和坏账暴露。`);
    }

    strategies.push("建议将经营利润、现金回笼、在贷余额三套指标分开展示，避免财务与风控口径混淆。");

    return {
      totalLoans: allDisbursements.length,
      totalCapitalDeployed: toMoney(totalCapitalDeployed),
      totalRevenue: toMoney(totalRevenue),
      totalPrincipalRecovered: toMoney(totalPrincipalRecovered),
      netProfit: toMoney(totalRevenue),
      currentOutstandingBalance: toMoney(toNumber(outstandingAgg._sum.remaining)),
      overallROI: totalCapitalDeployed > 0
        ? `${new Decimal(totalRevenue).div(totalCapitalDeployed).mul(100).toDecimalPlaces(2).toNumber()}%`
        : "0%",
      repaymentSpeed: {
        fastRepay: { count: fastRepayCount, revenue: toMoney(fastRevenue) },
        slowRepay: { count: slowRepayCount, revenue: toMoney(slowRevenue) },
        noRepay: { count: noRepayCount },
      },
      strategies,
    };
  }
}
