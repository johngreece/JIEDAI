import { NextResponse } from "next/server";
import { getFunderSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FunderInterestService } from "@/services/funder-interest.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getFunderSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const funder = await prisma.funder.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      name: true,
      cooperationMode: true,
      monthlyRate: true,
      weeklyRate: true,
      withdrawalCooldownDays: true,
      profitShareRatio: true,
      accounts: {
        where: { isActive: true },
        select: {
          id: true,
          accountName: true,
          bankName: true,
          balance: true,
          totalInflow: true,
          totalOutflow: true,
          totalProfit: true,
        },
      },
    },
  });

  if (!funder) {
    return NextResponse.json({ error: "资金方不存在" }, { status: 404 });
  }

  const earnings = await FunderInterestService.getEarnings(session.sub);

  const withdrawals = await prisma.funderWithdrawal.findMany({
    where: { funderId: session.sub },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const accountIds = funder.accounts.map((account) => account.id);
  const recentDisbursements = accountIds.length
    ? await prisma.disbursement.findMany({
        where: { fundAccountId: { in: accountIds } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          disbursementNo: true,
          amount: true,
          netAmount: true,
          feeAmount: true,
          status: true,
          disbursedAt: true,
          application: {
            select: {
              customer: { select: { name: true } },
            },
          },
        },
      })
    : [];

  const ruleGuide =
    funder.cooperationMode === "FIXED_MONTHLY"
      ? {
          title: "固定月息",
          formula: `按实际放款本金 × 月利率 ${Number(funder.monthlyRate)}% 计算，每满 30 天形成一笔利息。`,
          settlement: "本金可按账户余额申请提现，利息在满周期后可提。",
        }
      : {
          title: "周收益",
          formula: `按实际放款本金 × 周利率 ${Number(funder.weeklyRate)}% 估算，每满 7 天滚动计算。`,
          settlement: Number(funder.profitShareRatio || 0) > 0
            ? "若启用分润比例，则实际收益以客户回款中的费用和罚息分成为准。"
            : "未启用分润比例时，按周利率直接结算收益。",
        };

  return NextResponse.json({
    funder: {
      ...funder,
      monthlyRate: Number(funder.monthlyRate),
      weeklyRate: Number(funder.weeklyRate),
      profitShareRatio: Number(funder.profitShareRatio || 0),
      accounts: funder.accounts.map((account) => ({
        ...account,
        balance: Number(account.balance),
        totalInflow: Number(account.totalInflow),
        totalOutflow: Number(account.totalOutflow),
        totalProfit: Number(account.totalProfit),
      })),
    },
    earnings,
    ruleGuide,
    withdrawals: withdrawals.map((item) => ({
      id: item.id,
      amount: Number(item.amount),
      type: item.type,
      status: item.status,
      includeInterest: item.includeInterest,
      interestAmount: Number(item.interestAmount),
      remark: item.remark,
      createdAt: item.createdAt,
      approvedAt: item.approvedAt,
      rejectedReason: item.rejectedReason,
    })),
    recentDisbursements: recentDisbursements.map((item) => ({
      id: item.id,
      disbursementNo: item.disbursementNo,
      amount: Number(item.amount),
      netAmount: Number(item.netAmount),
      feeAmount: Number(item.feeAmount),
      status: item.status,
      disbursedAt: item.disbursedAt,
      customerName: item.application?.customer?.name ?? "-",
    })),
  });
}
