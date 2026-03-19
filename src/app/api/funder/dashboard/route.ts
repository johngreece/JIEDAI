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
      contactPerson: true,
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

  // 最近提现记录
  const withdrawals = await prisma.funderWithdrawal.findMany({
    where: { funderId: session.sub },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // 最近放款记录
  const accountIds = funder.accounts.map((a) => a.id);
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
            select: { customer: { select: { name: true } } },
          },
        },
      })
    : [];

  return NextResponse.json({
    funder: {
      ...funder,
      monthlyRate: Number(funder.monthlyRate),
      weeklyRate: Number(funder.weeklyRate),
      accounts: funder.accounts.map((a) => ({
        ...a,
        balance: Number(a.balance),
        totalInflow: Number(a.totalInflow),
        totalOutflow: Number(a.totalOutflow),
        totalProfit: Number(a.totalProfit),
      })),
    },
    earnings,
    withdrawals: withdrawals.map((w) => ({
      id: w.id,
      amount: Number(w.amount),
      type: w.type,
      status: w.status,
      includeInterest: w.includeInterest,
      interestAmount: Number(w.interestAmount),
      remark: w.remark,
      createdAt: w.createdAt,
      approvedAt: w.approvedAt,
      rejectedReason: w.rejectedReason,
    })),
    recentDisbursements: recentDisbursements.map((d) => ({
      id: d.id,
      disbursementNo: d.disbursementNo,
      amount: Number(d.amount),
      netAmount: Number(d.netAmount),
      feeAmount: Number(d.feeAmount),
      status: d.status,
      disbursedAt: d.disbursedAt,
      customerName: d.application?.customer?.name ?? "-",
    })),
  });
}
