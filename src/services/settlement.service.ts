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
    ]);

    const disbursedAmount = toNumber(disbursementAgg._sum.amount);
    const disbursedFee = toNumber(disbursementAgg._sum.feeAmount);
    const disbursedNet = toNumber(disbursementAgg._sum.netAmount);

    const repaidAmount = toNumber(repaymentAgg._sum.amount);
    const repaidPrincipal = toNumber(repaymentAgg._sum.principalPart);
    const repaidInterest = toNumber(repaymentAgg._sum.interestPart);
    const repaidFee = toNumber(repaymentAgg._sum.feePart);
    const repaidPenalty = toNumber(repaymentAgg._sum.penaltyPart);

    const totalIncome = disbursedFee + repaidInterest + repaidFee + repaidPenalty;
    const netProfit = totalIncome;
    const periodNetCashflow = repaidAmount - disbursedNet;
    const capitalOccupancy = Math.max(0, disbursedNet - repaidPrincipal);
    const capitalReleased = Math.max(0, repaidPrincipal - disbursedNet);

    const incomeRoi = disbursedNet > 0
      ? new Decimal(totalIncome).div(disbursedNet).mul(100).toDecimalPlaces(2).toNumber()
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
      capitalRecovery: toMoney(repaidPrincipal),
      grossROI: `${incomeRoi}%`,
      netROI: `${incomeRoi}%`,
      periodNetCashflow: toMoney(periodNetCashflow),
      capitalOccupancy: toMoney(capitalOccupancy),
      capitalReleased: toMoney(capitalReleased),
      currentOutstandingBalance: toMoney(toNumber(outstandingAgg._sum.remaining)),
      funderBalance: toMoney(toNumber(funderAgg._sum.balance)),
      funderProfit: toMoney(toNumber(funderAgg._sum.totalProfit)),
      ledgerDebitTotal: toMoney(toNumber(ledgerDebitAgg._sum.amount)),
      ledgerCreditTotal: toMoney(toNumber(ledgerCreditAgg._sum.amount)),
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

    const interestAgg = await prisma.repayment.aggregate({
      where: {
        receivedAt: { gte: start, lt: end },
        status: "CONFIRMED",
      },
      _sum: {
        interestPart: true,
        feePart: true,
        penaltyPart: true,
      },
    });

    const periodIncome =
      toNumber(interestAgg._sum.interestPart) +
      toNumber(interestAgg._sum.feePart) +
      toNumber(interestAgg._sum.penaltyPart);

    return funders.map((funder) => {
      const totalBalance = funder.accounts.reduce((sum, account) => sum + toNumber(account.balance), 0);
      const totalInflow = funder.accounts.reduce((sum, account) => sum + toNumber(account.totalInflow), 0);
      const shareRatio = toNumber(funder.profitShareRatio || 0);
      const shareAmount = new Decimal(periodIncome).mul(shareRatio).toDecimalPlaces(2).toNumber();
      const existingShare = funder.profitShares[0];

      return {
        funderId: funder.id,
        funderName: funder.name,
        contactPerson: funder.contactPerson,
        totalBalance,
        totalInflow,
        shareRatio: `${(shareRatio * 100).toFixed(1)}%`,
        shareAmount: shareAmount.toFixed(2),
        periodTotalInterest: periodIncome.toFixed(2),
        existingSettlement: existingShare
          ? {
              id: existingShare.id,
              status: existingShare.status,
              settledAt: existingShare.settledAt,
            }
          : null,
      };
    });
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
