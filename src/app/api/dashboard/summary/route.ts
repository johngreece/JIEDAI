import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function decimalToStr(d: unknown): string {
  if (d == null) return "0.00";
  const n = Number(d);
  return Number.isNaN(n) ? "0.00" : n.toFixed(2);
}

export async function GET() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [
    todayDisbursements,
    todayRepayments,
    disbursedApplications,
    allCustomers,
    activeLoans,
    overdueCount,
    totalOutstanding,
    funderBalances,
    pendingConfirmRepayment,
    pendingSignContract,
    pendingDisbursement,
    riskCustomers,
  ] = await Promise.all([
    prisma.disbursement.aggregate({
      where: {
        paidAt: { gte: today, lt: tomorrow },
        status: { in: ["paid", "confirmed"] },
      },
      _sum: { amountActual: true },
    }),
    prisma.repayment.aggregate({
      where: {
        paidAt: { gte: today, lt: tomorrow },
        status: "confirmed",
      },
      _sum: { amount: true },
    }),
    prisma.loanApplication.findMany({
      where: { status: "disbursed" },
      select: { id: true },
    }),
    prisma.customer.count({ where: { deletedAt: null } }),
    prisma.loanApplication.count({
      where: { status: "disbursed" },
    }),
    prisma.overdueRecord.count({ where: { status: "active" } }),
    prisma.repaymentPlan.aggregate({
      where: { status: "active" },
      _sum: { totalAmount: true },
    }),
    prisma.fundAccount.aggregate({
      where: { status: "active" },
      _sum: { balance: true },
    }),
    prisma.repayment.count({
      where: { status: "pending_confirm" },
    }),
    prisma.contract.count({
      where: { status: "pending_sign" },
    }),
    prisma.disbursement.count({
      where: { status: "pending" },
    }),
    prisma.customer.count({
      where: {
        deletedAt: null,
        OR: [{ isBlacklist: true }, { isWatchlist: true }],
      },
    }),
  ]);

  const totalLoans = disbursedApplications.length;
  const overdueRate =
    totalLoans > 0 ? ((overdueCount / totalLoans) * 100).toFixed(2) + "%" : "0%";

  return NextResponse.json({
    todayDisbursement: decimalToStr(todayDisbursements._sum.amountActual),
    todayRepayment: decimalToStr(todayRepayments._sum.amount),
    todayOverdue: "0.00",
    outstandingBalance: decimalToStr(totalOutstanding._sum.totalAmount),
    customerCount: allCustomers,
    activeLoanCount: activeLoans,
    overdueRate,
    funderBalance: decimalToStr(funderBalances._sum.balance),
    pendingConfirmRepayment,
    pendingSignContract,
    pendingDisbursement,
    riskCustomerCount: riskCustomers,
  });
}
