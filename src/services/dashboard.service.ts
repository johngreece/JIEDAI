import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";

export class DashboardService {
  /**
   * 获取管理端首页数据概览（增强版）
   */
  static async getSummary() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // 7 天前 / 30 天前
    const d7ago = new Date(today);
    d7ago.setDate(d7ago.getDate() - 7);
    const d30ago = new Date(today);
    d30ago.setDate(d30ago.getDate() - 30);

    const [
      todayDisbursements,
      todayRepayments,
      customerCount,
      activeLoanCount,
      overdueCount,
      totalOutstanding,
      funderBalances,
      pendingConfirmRepayment,
      pendingSignContract,
      pendingDisbursementCount,
      // ── 新增指标 ──
      totalDisbursedEver,
      totalRepaidEver,
      totalFeeEver,
      totalPenaltyEver,
      settledCount,
      week7Disb,
      week7Repay,
      overdueRecordsForAmount,
      activePlanItems,
      recentDisbursements,
      recentRepayments,
      // ── 昨日对比 ──
      yesterdayDisbursements,
      yesterdayRepayments,
    ] = await Promise.all([
      // 今日放款总额
      prisma.disbursement.aggregate({
        where: { disbursedAt: { gte: today, lt: tomorrow }, status: { in: ["PAID", "CONFIRMED"] } },
        _sum: { amount: true, feeAmount: true, netAmount: true },
        _count: true,
      }).catch(() => ({ _sum: { amount: 0, feeAmount: 0, netAmount: 0 }, _count: 0 })),

      // 今日收款总额
      prisma.repayment.aggregate({
        where: { receivedAt: { gte: today, lt: tomorrow }, status: "CONFIRMED" },
        _sum: { amount: true, principalPart: true, interestPart: true, feePart: true, penaltyPart: true },
        _count: true,
      }).catch(() => ({ _sum: { amount: 0, principalPart: 0, interestPart: 0, feePart: 0, penaltyPart: 0 }, _count: 0 })),

      prisma.customer.count({ where: { deletedAt: null } }),
      prisma.loanApplication.count({ where: { status: "DISBURSED" } }),
      prisma.overdueRecord.count({ where: { status: "OVERDUE" } }),

      prisma.repaymentPlan.aggregate({
        where: { status: "ACTIVE" },
        _sum: { totalPrincipal: true, totalInterest: true, totalFee: true },
        _count: true,
      }).catch(() => ({ _sum: { totalPrincipal: 0, totalInterest: 0, totalFee: 0 }, _count: 0 })),

      prisma.fundAccount.aggregate({
        where: { isActive: true },
        _sum: { balance: true, totalInflow: true, totalOutflow: true, totalProfit: true },
      }).catch(() => ({ _sum: { balance: 0, totalInflow: 0, totalOutflow: 0, totalProfit: 0 } })),

      prisma.repayment.count({ where: { status: "PENDING" } }),
      prisma.contract.count({ where: { status: "DRAFT" } }),
      prisma.disbursement.count({ where: { status: "PENDING" } }),

      // ── 历史累计 ──
      prisma.disbursement.aggregate({
        where: { status: { in: ["PAID", "CONFIRMED"] } },
        _sum: { amount: true, feeAmount: true, netAmount: true },
        _count: true,
      }).catch(() => ({ _sum: { amount: 0, feeAmount: 0, netAmount: 0 }, _count: 0 })),

      prisma.repayment.aggregate({
        where: { status: "CONFIRMED" },
        _sum: { amount: true, principalPart: true, interestPart: true, feePart: true, penaltyPart: true },
        _count: true,
      }).catch(() => ({ _sum: { amount: 0, principalPart: 0, interestPart: 0, feePart: 0, penaltyPart: 0 }, _count: 0 })),

      // 累计费用收入(台账)
      prisma.ledgerEntry.aggregate({
        where: { type: "FEE" },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: 0 } })),

      // 累计罚息收入(台账)
      prisma.ledgerEntry.aggregate({
        where: { type: "PENALTY" },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: 0 } })),

      // 已结清笔数
      prisma.loanApplication.count({ where: { status: "SETTLED" } }),

      // 近7天每日放款 (raw SQL for groupBy date)
      prisma.disbursement.findMany({
        where: { disbursedAt: { gte: d7ago }, status: { in: ["PAID", "CONFIRMED"] } },
        select: { disbursedAt: true, amount: true, feeAmount: true },
        orderBy: { disbursedAt: "asc" },
      }),

      // 近7天每日收款
      prisma.repayment.findMany({
        where: { receivedAt: { gte: d7ago }, status: "CONFIRMED" },
        select: { receivedAt: true, amount: true, interestPart: true, feePart: true, penaltyPart: true },
        orderBy: { receivedAt: "asc" },
      }),

      // 逾期金额汇总
      prisma.overdueRecord.aggregate({
        where: { status: "OVERDUE" },
        _sum: { overdueAmount: true, penaltyAmount: true },
      }).catch(() => ({ _sum: { overdueAmount: 0, penaltyAmount: 0 } })),

      // 活跃还款计划条目(计算预期收入)
      prisma.repaymentScheduleItem.findMany({
        where: { status: { in: ["PENDING", "PARTIAL"] }, plan: { status: "ACTIVE" } },
        select: { dueDate: true, principal: true, interest: true, fee: true, totalDue: true, remaining: true },
        orderBy: { dueDate: "asc" },
        take: 100,
      }),

      // 最近放款(时间线)
      prisma.disbursement.findMany({
        where: { status: { in: ["PAID", "CONFIRMED"] } },
        select: { id: true, disbursementNo: true, amount: true, netAmount: true, feeAmount: true, disbursedAt: true },
        orderBy: { disbursedAt: "desc" },
        take: 5,
      }),

      // 最近还款(时间线)
      prisma.repayment.findMany({
        where: { status: "CONFIRMED" },
        select: { id: true, repaymentNo: true, amount: true, receivedAt: true },
        orderBy: { receivedAt: "desc" },
        take: 5,
      }),

      // ── 昨日放款 ──
      prisma.disbursement.aggregate({
        where: { disbursedAt: { gte: yesterday, lt: today }, status: { in: ["PAID", "CONFIRMED"] } },
        _sum: { amount: true, feeAmount: true },
        _count: true,
      }).catch(() => ({ _sum: { amount: 0, feeAmount: 0 }, _count: 0 })),

      // ── 昨日收款 ──
      prisma.repayment.aggregate({
        where: { receivedAt: { gte: yesterday, lt: today }, status: "CONFIRMED" },
        _sum: { amount: true, interestPart: true, feePart: true, penaltyPart: true },
        _count: true,
      }).catch(() => ({ _sum: { amount: 0, interestPart: 0, feePart: 0, penaltyPart: 0 }, _count: 0 })),
    ]);

    // ── 7天趋势 ──
    const trendDays: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      trendDays.push(d.toISOString().slice(0, 10));
    }

    const disbTrend = trendDays.map((day) => {
      const items = week7Disb.filter((x) => x.disbursedAt && x.disbursedAt.toISOString().slice(0, 10) === day);
      return {
        date: day,
        amount: items.reduce((s, x) => s + Number(x.amount), 0),
        fee: items.reduce((s, x) => s + Number(x.feeAmount), 0),
        count: items.length,
      };
    });

    const repayTrend = trendDays.map((day) => {
      const items = week7Repay.filter((x) => x.receivedAt && x.receivedAt.toISOString().slice(0, 10) === day);
      return {
        date: day,
        amount: items.reduce((s, x) => s + Number(x.amount), 0),
        profit: items.reduce((s, x) => s + Number(x.interestPart) + Number(x.feePart) + Number(x.penaltyPart), 0),
        count: items.length,
      };
    });

    // ── 砍头息利润计算 ──
    const totalDisbAmount = Number(totalDisbursedEver._sum.amount || 0);
    const totalDisbFee = Number(totalDisbursedEver._sum.feeAmount || 0);
    const totalDisbNet = Number(totalDisbursedEver._sum.netAmount || 0);
    const totalRepaidAmount = Number(totalRepaidEver._sum.amount || 0);
    const totalRepaidPrincipal = Number(totalRepaidEver._sum.principalPart || 0);
    const totalRepaidInterest = Number(totalRepaidEver._sum.interestPart || 0);
    const totalRepaidFee = Number(totalRepaidEver._sum.feePart || 0);
    const totalRepaidPenalty = Number(totalRepaidEver._sum.penaltyPart || 0);
    const totalFeeIncome = Number(totalFeeEver._sum.amount || 0);
    const totalPenaltyIncome = Number(totalPenaltyEver._sum.amount || 0);

    // 总收益 = 砍头差额 + 还款利息 + 还款费用 + 罚息
    const upfrontProfit = totalDisbAmount - totalDisbNet;  // 砍头差额
    const repaymentProfit = totalRepaidInterest + totalRepaidFee + totalRepaidPenalty;
    const totalProfit = upfrontProfit + repaymentProfit;

    // 利润率 = 总收益 / 实际出借金额
    const profitRate = totalDisbNet > 0
      ? new Decimal(totalProfit).div(totalDisbNet).mul(100).toDecimalPlaces(2).toNumber()
      : 0;

    // 资金周转率 = 总放款额 / 资金池平均余额
    const avgFundBalance = Number(funderBalances._sum.balance || 0);
    const turnoverRate = avgFundBalance > 0
      ? new Decimal(totalDisbAmount).div(avgFundBalance).toDecimalPlaces(2).toNumber()
      : 0;

    // 逾期率
    const overdueRate = activeLoanCount > 0
      ? ((overdueCount / activeLoanCount) * 100).toFixed(2) + "%"
      : "0%";

    const toNum = (n: unknown) => Number(n || 0);
    const toFixed = (n: unknown) => toNum(n).toFixed(2);

    // 即将到期金额 (7天内)
    const d7future = new Date(today);
    d7future.setDate(d7future.getDate() + 7);
    const upcomingDue = activePlanItems
      .filter((x) => new Date(x.dueDate) <= d7future)
      .reduce((s, x) => s + Number(x.remaining || x.totalDue), 0);

    return {
      // ── 核心指标 ──
      todayDisbursement: toFixed(todayDisbursements._sum.amount),
      todayDisbursementCount: todayDisbursements._count ?? 0,
      todayDisbursementFee: toFixed(todayDisbursements._sum.feeAmount),
      todayRepayment: toFixed(todayRepayments._sum.amount),
      todayRepaymentCount: todayRepayments._count ?? 0,
      todayRepaymentProfit: toFixed(
        toNum(todayRepayments._sum.interestPart) +
          toNum(todayRepayments._sum.feePart) +
          toNum(todayRepayments._sum.penaltyPart)
      ),
      outstandingBalance: toFixed(totalOutstanding._sum.totalPrincipal),
      outstandingCount: totalOutstanding._count ?? 0,
      customerCount,
      activeLoanCount,
      overdueCount,
      overdueRate,
      overdueAmount: toFixed(overdueRecordsForAmount._sum.overdueAmount),
      overduePenalty: toFixed(overdueRecordsForAmount._sum.penaltyAmount),

      // ── 资金方 ──
      funderBalance: toFixed(funderBalances._sum.balance),
      funderTotalInflow: toFixed(funderBalances._sum.totalInflow),
      funderTotalOutflow: toFixed(funderBalances._sum.totalOutflow),
      funderTotalProfit: toFixed(funderBalances._sum.totalProfit),

      // ── 待办 ──
      pendingConfirmRepayment,
      pendingSignContract,
      pendingDisbursement: pendingDisbursementCount,

      // ── 财务结算 ──
      totalDisbursedAmount: toFixed(totalDisbAmount),
      totalDisbursedCount: totalDisbursedEver._count ?? 0,
      totalDisbursedFee: toFixed(totalDisbFee),
      totalDisbursedNet: toFixed(totalDisbNet),
      totalRepaidAmount: toFixed(totalRepaidAmount),
      totalRepaidCount: totalRepaidEver._count ?? 0,
      totalRepaidPrincipal: toFixed(totalRepaidPrincipal),
      totalRepaidInterest: toFixed(totalRepaidInterest),
      totalRepaidFee: toFixed(totalRepaidFee),
      totalRepaidPenalty: toFixed(totalRepaidPenalty),
      totalFeeIncome: toFixed(totalFeeIncome),
      totalPenaltyIncome: toFixed(totalPenaltyIncome),
      settledCount,

      // ── 利润分析(砍头息) ──
      upfrontProfit: toFixed(upfrontProfit),
      repaymentProfit: toFixed(repaymentProfit),
      totalProfit: toFixed(totalProfit),
      profitRate,
      turnoverRate,

      // ── 趋势 ──
      disbursementTrend: disbTrend,
      repaymentTrend: repayTrend,

      // ── 预期 ──
      upcomingDue7d: toFixed(upcomingDue),

      // ── 时间线 ──
      recentDisbursements,
      recentRepayments,

      // ── 昨日对比 ──
      yesterdayDisbursement: toFixed(yesterdayDisbursements._sum.amount),
      yesterdayDisbursementCount: yesterdayDisbursements._count ?? 0,
      yesterdayRepayment: toFixed(yesterdayRepayments._sum.amount),
      yesterdayRepaymentCount: yesterdayRepayments._count ?? 0,
      yesterdayRepaymentProfit: toFixed(
        toNum(yesterdayRepayments._sum.interestPart) +
          toNum(yesterdayRepayments._sum.feePart) +
          toNum(yesterdayRepayments._sum.penaltyPart)
      ),
    };
  }
}