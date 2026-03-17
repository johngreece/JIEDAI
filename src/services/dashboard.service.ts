import { prisma } from "@/lib/prisma";

export class DashboardService {
  /**
   * 获取管理端首页数据概览
   */
  static async getSummary() {
    // 1. 获取今日时间范围 (00:00:00 - 23:59:59)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 2. 并行查询各项指标
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
      // riskCustomers, // Remove if not in schema or use logic
    ] = await Promise.all([
      // 今日放款总额
      prisma.disbursement.aggregate({
        where: { 
          disbursedAt: { gte: today, lt: tomorrow }, 
          status: { in: ["PAID", "CONFIRMED"] } 
        },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: 0 } })),

      // 今日收款总额
      prisma.repayment.aggregate({
        where: { 
          receivedAt: { gte: today, lt: tomorrow }, 
          status: "CONFIRMED" 
        },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: 0 } })),

      // 客户总数
      prisma.customer.count({ where: { deletedAt: null } }),

      // 活跃借款数 (Status: DISBURSED) - Match legacy logic
      prisma.loanApplication.count({
        where: { status: "DISBURSED" },
      }),

      // 逾期记录数
      prisma.overdueRecord.count({ where: { status: "OVERDUE" } }),

      // 在贷余额 (Active Repayment Plans Total Principal)
      prisma.repaymentPlan.aggregate({
        where: { status: "ACTIVE" },
        _sum: { totalPrincipal: true },
      }).catch(() => ({ _sum: { totalPrincipal: 0 } })),

      // 资金方余额
      prisma.fundAccount.aggregate({
        where: { isActive: true },
        _sum: { balance: true },
      }).catch(() => ({ _sum: { balance: 0 } })),

      // 待办事项: 待确认还款
      prisma.repayment.count({ where: { status: "PENDING" } }),
      
      // 待办事项: 待签合同
      prisma.contract.count({ where: { status: "DRAFT" } }),
      
      // 待办事项: 待放款
      prisma.disbursement.count({ where: { status: "PENDING" } }),
    ]);

    // 3. 计算逾期率
    const overdueRate =
      activeLoanCount > 0 
      ? ((overdueCount / activeLoanCount) * 100).toFixed(2) + "%" 
      : "0%";

    // 4. 辅助函数
    const toDecimal = (n: any) => Number(n || 0).toFixed(2);

    return {
      todayDisbursement: toDecimal(todayDisbursements._sum.amount),
      todayRepayment: toDecimal(todayRepayments._sum.amount),
      todayOverdue: "0.00", // Legacy returned "0.00"
      outstandingBalance: toDecimal(totalOutstanding._sum.totalPrincipal),
      customerCount,
      activeLoanCount,
      overdueRate,
      funderBalance: toDecimal(funderBalances._sum.balance),
      pendingConfirmRepayment,
      pendingSignContract,
      pendingDisbursement: pendingDisbursementCount,
      riskCustomerCount: 0, // Legacy returned 0
    };
  }
}