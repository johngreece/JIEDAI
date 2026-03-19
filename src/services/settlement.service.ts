/**
 * 财务结算服务
 *
 * 功能:
 *  1. 按时间段生成结算报表(日/周/月/自定义)
 *  2. 收入明细: 砍头费 + 利息 + 费用 + 罚息
 *  3. 支出明细: 放款本金
 *  4. 利润 & ROI 分析
 *  5. 资金方分润结算
 *  6. 客户维度对账
 */

import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";

export interface SettlementPeriod {
  start: Date;
  end: Date;
}

export interface SettlementSummary {
  period: { start: string; end: string };

  // ── 放款 ──
  disbursedCount: number;
  disbursedAmount: string;      // 放款总额(含砍头)
  disbursedFee: string;         // 砍头费总额
  disbursedNet: string;         // 实际出借

  // ── 还款 ──
  repaidCount: number;
  repaidAmount: string;         // 还款总额
  repaidPrincipal: string;
  repaidInterest: string;
  repaidFee: string;
  repaidPenalty: string;

  // ── 逾期 ──
  overdueCount: number;
  overdueAmount: string;
  overduePenalty: string;

  // ── 利润 ──
  totalIncome: string;          // 总收入 = 砍头费 + 利息 + 费用 + 罚息
  totalOutflow: string;         // 总支出 = 实际出借
  netProfit: string;            // 净利润 = 收入 - (出借 - 收回本金)
  capitalRecovery: string;      // 本金回收
  grossROI: string;             // 毛利率 = 总收入 / 实际出借
  netROI: string;               // 净利率 = 净利润 / 实际出借

  // ── 资金方 ──
  funderBalance: string;
  funderProfit: string;

  // ── 台账 ──
  ledgerDebitTotal: string;     // DEBIT 合计(入)
  ledgerCreditTotal: string;    // CREDIT 合计(出)
}

export interface DailyBreakdown {
  date: string;
  disbursedAmount: number;
  disbursedFee: number;
  repaidAmount: number;
  repaidProfit: number;     // interest + fee + penalty
  netCashflow: number;      // repaid - disbursedNet
}

export interface CustomerSettlement {
  customerId: string;
  customerName: string;
  phone: string;
  totalBorrowed: number;
  totalRepaid: number;
  outstandingBalance: number;
  profitFromCustomer: number;   // fee + interest + penalty
  loanCount: number;
  isOverdue: boolean;
}

export class SettlementService {
  /**
   * 生成结算报表
   */
  static async generateReport(period: SettlementPeriod): Promise<SettlementSummary> {
    const { start, end } = period;

    const [
      disbAgg,
      repayAgg,
      overdueAgg,
      ledgerDebit,
      ledgerCredit,
      funderAgg,
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
        _sum: { amount: true, principalPart: true, interestPart: true, feePart: true, penaltyPart: true },
        _count: true,
      }).catch(() => ({ _sum: { amount: 0, principalPart: 0, interestPart: 0, feePart: 0, penaltyPart: 0 }, _count: 0 })),

      prisma.overdueRecord.aggregate({
        where: {
          createdAt: { gte: start, lt: end },
          status: "OVERDUE",
        },
        _sum: { overdueAmount: true, penaltyAmount: true },
        _count: true,
      }).catch(() => ({ _sum: { overdueAmount: 0, penaltyAmount: 0 }, _count: 0 })),

      // 期间 DEBIT 合计
      prisma.ledgerEntry.aggregate({
        where: { createdAt: { gte: start, lt: end }, direction: "DEBIT" },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: 0 } })),

      // 期间 CREDIT 合计
      prisma.ledgerEntry.aggregate({
        where: { createdAt: { gte: start, lt: end }, direction: "CREDIT" },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: 0 } })),

      prisma.fundAccount.aggregate({
        where: { isActive: true },
        _sum: { balance: true, totalProfit: true },
      }).catch(() => ({ _sum: { balance: 0, totalProfit: 0 } })),
    ]);

    const n = (v: unknown) => Number(v || 0);
    const f = (v: number) => new Decimal(v).toFixed(2);

    const disbAmount = n(disbAgg._sum.amount);
    const disbFee = n(disbAgg._sum.feeAmount);
    const disbNet = n(disbAgg._sum.netAmount);
    const repPrincipal = n(repayAgg._sum.principalPart);
    const repInterest = n(repayAgg._sum.interestPart);
    const repFee = n(repayAgg._sum.feePart);
    const repPenalty = n(repayAgg._sum.penaltyPart);

    const totalIncome = disbFee + repInterest + repFee + repPenalty;
    const capitalRecovery = repPrincipal;
    // 净利润 = 总收入 - (实际出借 - 回收本金) = 总收入 - 净资金占用
    const netProfit = totalIncome - (disbNet - capitalRecovery);

    const grossROI = disbNet > 0
      ? new Decimal(totalIncome).div(disbNet).mul(100).toDecimalPlaces(2).toNumber()
      : 0;
    const netROI = disbNet > 0
      ? new Decimal(netProfit).div(disbNet).mul(100).toDecimalPlaces(2).toNumber()
      : 0;

    return {
      period: { start: start.toISOString(), end: end.toISOString() },
      disbursedCount: disbAgg._count ?? 0,
      disbursedAmount: f(disbAmount),
      disbursedFee: f(disbFee),
      disbursedNet: f(disbNet),
      repaidCount: repayAgg._count ?? 0,
      repaidAmount: f(n(repayAgg._sum.amount)),
      repaidPrincipal: f(repPrincipal),
      repaidInterest: f(repInterest),
      repaidFee: f(repFee),
      repaidPenalty: f(repPenalty),
      overdueCount: overdueAgg._count ?? 0,
      overdueAmount: f(n(overdueAgg._sum.overdueAmount)),
      overduePenalty: f(n(overdueAgg._sum.penaltyAmount)),
      totalIncome: f(totalIncome),
      totalOutflow: f(disbNet),
      netProfit: f(netProfit),
      capitalRecovery: f(capitalRecovery),
      grossROI: `${grossROI}%`,
      netROI: `${netROI}%`,
      funderBalance: f(n(funderAgg._sum.balance)),
      funderProfit: f(n(funderAgg._sum.totalProfit)),
      ledgerDebitTotal: f(n(ledgerDebit._sum.amount)),
      ledgerCreditTotal: f(n(ledgerCredit._sum.amount)),
    };
  }

  /**
   * 每日明细拆分
   */
  static async getDailyBreakdown(period: SettlementPeriod): Promise<DailyBreakdown[]> {
    const { start, end } = period;

    const [disbursements, repayments] = await Promise.all([
      prisma.disbursement.findMany({
        where: { disbursedAt: { gte: start, lt: end }, status: { in: ["PAID", "CONFIRMED"] } },
        select: { disbursedAt: true, amount: true, feeAmount: true, netAmount: true },
        orderBy: { disbursedAt: "asc" },
      }),
      prisma.repayment.findMany({
        where: { receivedAt: { gte: start, lt: end }, status: "CONFIRMED" },
        select: { receivedAt: true, amount: true, interestPart: true, feePart: true, penaltyPart: true },
        orderBy: { receivedAt: "asc" },
      }),
    ]);

    // 按日聚合
    const dayMap = new Map<string, DailyBreakdown>();

    const d = new Date(start);
    while (d < end) {
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, { date: key, disbursedAmount: 0, disbursedFee: 0, repaidAmount: 0, repaidProfit: 0, netCashflow: 0 });
      d.setDate(d.getDate() + 1);
    }

    for (const disb of disbursements) {
      if (!disb.disbursedAt) continue;
      const key = disb.disbursedAt.toISOString().slice(0, 10);
      const row = dayMap.get(key);
      if (row) {
        row.disbursedAmount += Number(disb.amount);
        row.disbursedFee += Number(disb.feeAmount);
        row.netCashflow -= Number(disb.netAmount);
      }
    }

    for (const rep of repayments) {
      if (!rep.receivedAt) continue;
      const key = rep.receivedAt.toISOString().slice(0, 10);
      const row = dayMap.get(key);
      if (row) {
        row.repaidAmount += Number(rep.amount);
        row.repaidProfit += Number(rep.interestPart) + Number(rep.feePart) + Number(rep.penaltyPart);
        row.netCashflow += Number(rep.amount);
      }
    }

    return Array.from(dayMap.values());
  }

  /**
   * 客户维度对账
   */
  static async getCustomerSettlement(period: SettlementPeriod): Promise<CustomerSettlement[]> {
    const { start, end } = period;

    // 获取期间内有业务的客户
    const customers = await prisma.customer.findMany({
      where: {
        deletedAt: null,
        OR: [
          { loanApplications: { some: { createdAt: { gte: start, lt: end } } } },
          { ledgerEntries: { some: { createdAt: { gte: start, lt: end } } } },
        ],
      },
      select: { id: true, name: true, phone: true },
    });

    const results: CustomerSettlement[] = [];

    for (const cust of customers) {
      const [disbAgg, repayAgg, lastEntry, overdueCount, loanCount] = await Promise.all([
        prisma.disbursement.aggregate({
          where: {
            application: { customerId: cust.id },
            disbursedAt: { gte: start, lt: end },
            status: { in: ["PAID", "CONFIRMED"] },
          },
          _sum: { amount: true, feeAmount: true },
        }).catch(() => ({ _sum: { amount: 0, feeAmount: 0 } })),

        prisma.repayment.aggregate({
          where: {
            plan: { applicationId: { in: await prisma.loanApplication.findMany({ where: { customerId: cust.id }, select: { id: true } }).then(ids => ids.map(x => x.id)) } },
            receivedAt: { gte: start, lt: end },
            status: "CONFIRMED",
          },
          _sum: { amount: true, interestPart: true, feePart: true, penaltyPart: true },
        }).catch(() => ({ _sum: { amount: 0, interestPart: 0, feePart: 0, penaltyPart: 0 } })),

        prisma.ledgerEntry.findFirst({
          where: { customerId: cust.id },
          orderBy: { createdAt: "desc" },
          select: { balanceAfter: true },
        }),

        prisma.overdueRecord.count({
          where: { customerId: cust.id, status: "OVERDUE" },
        }),

        prisma.loanApplication.count({
          where: { customerId: cust.id, createdAt: { gte: start, lt: end } },
        }),
      ]);

      const totalBorrowed = Number(disbAgg._sum?.amount || 0);
      const totalRepaid = Number(repayAgg._sum?.amount || 0);
      const profitFromCustomer =
        Number(disbAgg._sum?.feeAmount || 0) +
        Number(repayAgg._sum?.interestPart || 0) +
        Number(repayAgg._sum?.feePart || 0) +
        Number(repayAgg._sum?.penaltyPart || 0);

      results.push({
        customerId: cust.id,
        customerName: cust.name,
        phone: cust.phone,
        totalBorrowed,
        totalRepaid,
        outstandingBalance: Number(lastEntry?.balanceAfter || 0),
        profitFromCustomer,
        loanCount,
        isOverdue: overdueCount > 0,
      });
    }

    // 按利润从高到低排列
    results.sort((a, b) => b.profitFromCustomer - a.profitFromCustomer);
    return results;
  }

  /**
   * 资金方分润计算
   */
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

    // 期间总利息收入
    const totalInterestAgg = await prisma.repayment.aggregate({
      where: { receivedAt: { gte: start, lt: end }, status: "CONFIRMED" },
      _sum: { interestPart: true, feePart: true, penaltyPart: true },
    });

    const totalInterest =
      Number(totalInterestAgg._sum.interestPart || 0) +
      Number(totalInterestAgg._sum.feePart || 0) +
      Number(totalInterestAgg._sum.penaltyPart || 0);

    return funders.map((f) => {
      const totalBalance = f.accounts.reduce((s, a) => s + Number(a.balance), 0);
      const totalInflow = f.accounts.reduce((s, a) => s + Number(a.totalInflow), 0);
      const shareRatio = Number(f.profitShareRatio || 0);
      const shareAmount = new Decimal(totalInterest).mul(shareRatio).toDecimalPlaces(2).toNumber();
      const existingShare = f.profitShares[0];

      return {
        funderId: f.id,
        funderName: f.name,
        contactPerson: f.contactPerson,
        totalBalance,
        totalInflow,
        shareRatio: `${(shareRatio * 100).toFixed(1)}%`,
        shareAmount: shareAmount.toFixed(2),
        periodTotalInterest: totalInterest.toFixed(2),
        existingSettlement: existingShare
          ? { id: existingShare.id, status: existingShare.status, settledAt: existingShare.settledAt }
          : null,
      };
    });
  }

  /**
   * 砍头息利润最大化分析
   */
  static async profitMaximizationAnalysis() {
    // 获取所有已完成的放款，按阶梯分析利润
    const allDisb = await prisma.disbursement.findMany({
      where: { status: { in: ["PAID", "CONFIRMED"] } },
      select: {
        id: true, amount: true, feeAmount: true, netAmount: true, disbursedAt: true,
        applicationId: true,
      },
      orderBy: { disbursedAt: "desc" },
    });

    // Fetch repayments for these applications
    const applicationIds = allDisb.map(d => d.applicationId);
    const repaymentPlans = await prisma.repaymentPlan.findMany({
      where: { applicationId: { in: applicationIds } },
      select: {
        applicationId: true,
        repayments: {
          where: { status: "CONFIRMED" },
          select: { amount: true, interestPart: true, feePart: true, penaltyPart: true, receivedAt: true },
        },
      },
    });
    const repaymentsByApp = new Map<string, typeof repaymentPlans[0]["repayments"]>();
    for (const plan of repaymentPlans) {
      const existing = repaymentsByApp.get(plan.applicationId) || [];
      repaymentsByApp.set(plan.applicationId, [...existing, ...plan.repayments]);
    }

    let totalCapitalDeployed = 0;    // 实际出借总额
    let totalRevenue = 0;            // 总收入(费+息+罚)
    let totalPrincipalRecovered = 0;
    let fastRepayCount = 0;          // <=24h还款笔数
    let slowRepayCount = 0;          // >24h还款笔数
    let lossCount = 0;               // 未还款
    let fastRevenue = 0;
    let slowRevenue = 0;

    for (const disb of allDisb) {
      const net = Number(disb.netAmount);
      const fee = Number(disb.feeAmount);
      totalCapitalDeployed += net;
      totalRevenue += fee;  // 砍头费已经锁定为收入

      const allRepayments = repaymentsByApp.get(disb.applicationId) || [];
      if (allRepayments.length === 0) {
        lossCount++;
        continue;
      }

      for (const rep of allRepayments) {
        totalRevenue += Number(rep.interestPart) + Number(rep.feePart) + Number(rep.penaltyPart);
        totalPrincipalRecovered += Number(rep.amount) - Number(rep.interestPart) - Number(rep.feePart) - Number(rep.penaltyPart);

        // 判断快速还款 vs 慢速还款
        if (disb.disbursedAt && rep.receivedAt) {
          const hours = (new Date(rep.receivedAt).getTime() - new Date(disb.disbursedAt).getTime()) / 3600000;
          if (hours <= 24) {
            fastRepayCount++;
            fastRevenue += Number(rep.interestPart) + Number(rep.feePart) + Number(rep.penaltyPart);
          } else {
            slowRepayCount++;
            slowRevenue += Number(rep.interestPart) + Number(rep.feePart) + Number(rep.penaltyPart);
          }
        }
      }
    }

    const f = (n: number) => new Decimal(n).toFixed(2);

    // 利益最大化策略
    const strategies: string[] = [];

    // 1. 资金周转策略
    const avgTurnoverDays = allDisb.length > 0 ? 7 : 0; // 默认7日产品
    if (totalCapitalDeployed > 0) {
      const annualTurnover = 365 / Math.max(avgTurnoverDays, 1);
      const annualROI = totalCapitalDeployed > 0
        ? new Decimal(totalRevenue).div(totalCapitalDeployed).mul(annualTurnover).mul(100).toDecimalPlaces(1).toNumber()
        : 0;
      strategies.push(`当前资金年化收益率约 ${annualROI}%，提高周转速度(鼓励早还)可提升年化`);
    }

    // 2. 砍头费率优化
    if (allDisb.length > 0) {
      const avgFeeRate = totalRevenue > 0
        ? new Decimal(allDisb.reduce((s, d) => s + Number(d.feeAmount), 0)).div(allDisb.reduce((s, d) => s + Number(d.amount), 0)).mul(100).toDecimalPlaces(1).toNumber()
        : 0;
      strategies.push(`平均砍头费率 ${avgFeeRate}%，建议保持在 3-8% 区间兼顾获客与利润`);
    }

    // 3. 快速还款占比
    const totalRepayCount = fastRepayCount + slowRepayCount;
    if (totalRepayCount > 0) {
      const fastPct = ((fastRepayCount / totalRepayCount) * 100).toFixed(0);
      strategies.push(`24h内还款占 ${fastPct}%，快速还款虽利润低但周转快，建议维持 40-60%`);
    }

    // 4. 逾期控制
    if (lossCount > 0) {
      strategies.push(`有 ${lossCount} 笔未还款，控制坏账率 <5% 是利润最大化前提`);
    }

    // 5. 阶梯费率建议
    strategies.push("砍头息+阶梯费率组合: 前5h低费率吸引快速还款提高周转, 5h-7d逐级提高费率确保利润覆盖资金成本");

    return {
      totalLoans: allDisb.length,
      totalCapitalDeployed: f(totalCapitalDeployed),
      totalRevenue: f(totalRevenue),
      totalPrincipalRecovered: f(totalPrincipalRecovered),
      netProfit: f(totalRevenue - (totalCapitalDeployed - totalPrincipalRecovered)),
      overallROI: totalCapitalDeployed > 0
        ? `${new Decimal(totalRevenue).div(totalCapitalDeployed).mul(100).toDecimalPlaces(2).toNumber()}%`
        : "0%",
      repaymentSpeed: {
        fastRepay: { count: fastRepayCount, revenue: f(fastRevenue) },
        slowRepay: { count: slowRepayCount, revenue: f(slowRevenue) },
        noRepay: { count: lossCount },
      },
      strategies,
    };
  }
}
