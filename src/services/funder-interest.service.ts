import { prisma } from "@/lib/prisma";

/**
 * 资金方利息计算引擎
 *
 * 模式1: FIXED_MONTHLY — 固定月息
 *   - 按投入总额 × 月利率(默认2%)计算
 *   - 满1个月可提现（本金+利息 或 仅利息）
 *   - 提前取回本金不付利息
 *   - 系统优先使用该资金方的资金放款
 *
 * 模式2: VOLUME_BASED — 按业务量（流动资金）
 *   - 仅按实际放出资金计算利息
 *   - 7天周期 × 周利率(默认1.5%)
 *   - 未放出资金可随时提现
 *   - 利息每周可提现
 *   - 不承担风险，利息与平台结算
 */

interface FunderEarnings {
  funderId: string;
  funderName: string;
  cooperationMode: string;
  totalDeposited: number;      // 总投入
  totalDeployed: number;       // 实际放出（在贷）
  idleFunds: number;           // 闲置资金
  accruedInterest: number;     // 已产生利息
  withdrawableInterest: number; // 可提现利息
  withdrawablePrincipal: number; // 可提现本金
  totalWithdrawn: number;      // 已提现总额
  earningSummary: EarningPeriod[];
}

interface EarningPeriod {
  periodStart: Date;
  periodEnd: Date;
  principal: number;
  deployed: number;
  rate: number;
  interest: number;
  withdrawable: boolean;
}

export class FunderInterestService {
  /**
   * 计算资金方的完整收益概览
   */
  static async getEarnings(funderId: string): Promise<FunderEarnings> {
    const funder = await prisma.funder.findUniqueOrThrow({
      where: { id: funderId },
      include: {
        accounts: { where: { isActive: true } },
        withdrawalRequests: { where: { status: { in: ["APPROVED", "PENDING"] } } },
      },
    });

    const totalDeposited = funder.accounts.reduce((s, a) => s + Number(a.totalInflow), 0);
    const totalBalance = funder.accounts.reduce((s, a) => s + Number(a.balance), 0);
    const totalWithdrawn = funder.withdrawalRequests
      .filter((w) => w.status === "APPROVED")
      .reduce((s, w) => s + Number(w.amount), 0);

    // 查询该资金方实际在贷的放款金额
    const accountIds = funder.accounts.map((a) => a.id);
    const activeDisbursements = accountIds.length
      ? await prisma.disbursement.findMany({
          where: {
            fundAccountId: { in: accountIds },
            status: { in: ["PAID", "CONFIRMED"] },
          },
          select: { netAmount: true, disbursedAt: true },
        })
      : [];
    const totalDeployed = activeDisbursements.reduce((s, d) => s + Number(d.netAmount), 0);
    const idleFunds = Math.max(0, totalBalance - 0); // balance already excludes deployed

    const mode = funder.cooperationMode;
    const now = new Date();

    let accruedInterest = 0;
    let withdrawableInterest = 0;
    let withdrawablePrincipal = 0;
    const earningSummary: EarningPeriod[] = [];

    if (mode === "FIXED_MONTHLY") {
      // 固定月息模式
      const monthlyRate = Number(funder.monthlyRate) / 100;

      // 找每个资金注入的开始日期，按月计算利息
      for (const account of funder.accounts) {
        const inflows = await prisma.capitalInflow.findMany({
          where: { fundAccountId: account.id, status: "CONFIRMED" },
          orderBy: { inflowDate: "asc" },
        });

        for (const inflow of inflows) {
          const inflowDate = new Date(inflow.inflowDate);
          const daysSince = Math.floor((now.getTime() - inflowDate.getTime()) / (1000 * 60 * 60 * 24));
          const fullMonths = Math.floor(daysSince / 30);
          const principal = Number(inflow.amount);

          if (fullMonths >= 1) {
            const interest = principal * monthlyRate * fullMonths;
            accruedInterest += interest;
            withdrawableInterest += interest;

            earningSummary.push({
              periodStart: inflowDate,
              periodEnd: now,
              principal,
              deployed: totalDeployed,
              rate: Number(funder.monthlyRate),
              interest,
              withdrawable: true,
            });
          } else {
            // 不满1个月，可提前取回本金但无利息
            earningSummary.push({
              periodStart: inflowDate,
              periodEnd: now,
              principal,
              deployed: totalDeployed,
              rate: Number(funder.monthlyRate),
              interest: 0,
              withdrawable: false,
            });
          }
        }
      }

      // 可提现本金 = 总余额（提前取回不付利息）
      withdrawablePrincipal = totalBalance;

    } else if (mode === "VOLUME_BASED") {
      // 按业务量模式：7天周期，仅按实际放出金额计利息
      const weeklyRate = Number(funder.weeklyRate) / 100;

      // 按每笔放款的实际在外天数计算
      for (const disb of activeDisbursements) {
        const disbDate = new Date(disb.disbursedAt!);
        const daysSince = Math.floor((now.getTime() - disbDate.getTime()) / (1000 * 60 * 60 * 24));
        const fullWeeks = Math.floor(daysSince / 7);
        const deployed = Number(disb.netAmount);

        if (fullWeeks >= 1) {
          const interest = deployed * weeklyRate * fullWeeks;
          accruedInterest += interest;
          withdrawableInterest += interest;

          earningSummary.push({
            periodStart: disbDate,
            periodEnd: now,
            principal: deployed,
            deployed,
            rate: Number(funder.weeklyRate),
            interest,
            withdrawable: true,
          });
        }
      }

      // 闲置资金可随时提现
      withdrawablePrincipal = totalBalance;
    }

    // 减去已提现的利息
    const withdrawnInterest = funder.withdrawalRequests
      .filter((w) => w.status === "APPROVED" && w.type === "INTEREST")
      .reduce((s, w) => s + Number(w.interestAmount), 0);
    withdrawableInterest = Math.max(0, withdrawableInterest - withdrawnInterest);

    // 逾期风险分担：如果资金方开启了风险共担，按比例扣减利息
    let riskDeduction = 0;
    if (funder.riskSharing && Number(funder.riskShareRatio) > 0 && accountIds.length) {
      const overdueDisbursements = await prisma.disbursement.findMany({
        where: {
          fundAccountId: { in: accountIds },
          status: "OVERDUE",
        },
        select: { netAmount: true },
      });
      const overdueTotal = overdueDisbursements.reduce((s, d) => s + Number(d.netAmount), 0);
      riskDeduction = overdueTotal * Number(funder.riskShareRatio);
      withdrawableInterest = Math.max(0, withdrawableInterest - riskDeduction);
    }

    return {
      funderId: funder.id,
      funderName: funder.name,
      cooperationMode: mode,
      totalDeposited,
      totalDeployed,
      idleFunds: totalBalance,
      accruedInterest,
      withdrawableInterest,
      withdrawablePrincipal,
      totalWithdrawn,
      earningSummary,
    };
  }

  /**
   * 创建提现申请
   */
  static async requestWithdrawal(params: {
    funderId: string;
    amount: number;
    type: "PRINCIPAL" | "INTEREST" | "PRINCIPAL_AND_INTEREST";
    includeInterest: boolean;
    remark?: string;
  }) {
    const earnings = await this.getEarnings(params.funderId);
    const funder = await prisma.funder.findUniqueOrThrow({ where: { id: params.funderId } });

    // 提现冷却期检查
    if (funder.withdrawalCooldownDays > 0) {
      const lastApproved = await prisma.funderWithdrawal.findFirst({
        where: { funderId: params.funderId, status: "APPROVED" },
        orderBy: { approvedAt: "desc" },
      });
      if (lastApproved?.approvedAt) {
        const cooldownEnd = new Date(lastApproved.approvedAt);
        cooldownEnd.setDate(cooldownEnd.getDate() + funder.withdrawalCooldownDays);
        if (new Date() < cooldownEnd) {
          const remaining = Math.ceil((cooldownEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          throw new Error(`提现冷却期未结束，还需等待 ${remaining} 天`);
        }
      }
    }

    let maxAmount = 0;
    let interestAmount = 0;

    if (params.type === "INTEREST") {
      maxAmount = earnings.withdrawableInterest;
      interestAmount = Math.min(params.amount, maxAmount);
    } else if (params.type === "PRINCIPAL") {
      // 提前取本金，固定月息模式下不付利息
      maxAmount = earnings.withdrawablePrincipal;
      interestAmount = 0;
    } else {
      // 本息一起
      maxAmount = earnings.withdrawablePrincipal + earnings.withdrawableInterest;
      interestAmount = earnings.withdrawableInterest;
    }

    if (params.amount > maxAmount) {
      throw new Error(`可提现金额不足，最大可提 €${maxAmount.toFixed(2)}`);
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

  /**
   * 管理员审批提现
   */
  static async approveWithdrawal(withdrawalId: string, adminId: string) {
    const withdrawal = await prisma.funderWithdrawal.findUniqueOrThrow({
      where: { id: withdrawalId },
      include: { funder: { include: { accounts: { where: { isActive: true }, take: 1 } } } },
    });

    if (withdrawal.status !== "PENDING") {
      throw new Error("该申请已被处理");
    }

    return prisma.$transaction(async (tx) => {
      // 更新提现状态
      await tx.funderWithdrawal.update({
        where: { id: withdrawalId },
        data: { status: "APPROVED", approvedAt: new Date(), approvedBy: adminId },
      });

      // 从账户扣减余额
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

  /**
   * 管理员拒绝提现
   */
  static async rejectWithdrawal(withdrawalId: string, reason: string) {
    return prisma.funderWithdrawal.update({
      where: { id: withdrawalId },
      data: { status: "REJECTED", rejectedAt: new Date(), rejectedReason: reason },
    });
  }
}
