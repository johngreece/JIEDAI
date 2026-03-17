import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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
    allCustomers,
    activeLoans,
    overdueCount,
    totalOutstanding,
    funderBalances,
    pendingConfirmRepayment,
    pendingSignContract,
    pendingDisbursement,
  ] = await Promise.all([
    prisma.disbursement.aggregate({
      where: {
        disbursedAt: { gte: today, lt: tomorrow },
        status: { in: ["PAID", "CONFIRMED"] },
      },
      _sum: { amount: true },
    }),
    prisma.repayment.aggregate({
      where: {
        receivedAt: { gte: today, lt: tomorrow },
        status: "CONFIRMED",
      },
      _sum: { amount: true },
    }),
    prisma.customer.count({ where: { deletedAt: null } }),
    prisma.loanApplication.count({
      where: { status: "DISBURSED" },
    }),
    prisma.overdueRecord.count({ where: { status: "OVERDUE" } }),
    prisma.repaymentPlan.aggregate({
      where: { status: "ACTIVE" },
      _sum: { totalPrincipal: true },
    }),
    prisma.fundAccount.aggregate({
      where: { isActive: true },
      _sum: { balance: true },
    }),
    prisma.repayment.count({
      where: { status: "PENDING" },
    }),
    prisma.contract.count({
      where: { status: "DRAFT" },
    }),
    prisma.disbursement.count({
      where: { status: "PENDING" },
    }),
  ]);

  const overdueRate =
    activeLoans > 0 ? ((overdueCount / activeLoans) * 100).toFixed(2) + "%" : "0%";

  return NextResponse.json({
    todayDisbursement: decimalToStr(todayDisbursements._sum.amount),
    todayRepayment: decimalToStr(todayRepayments._sum.amount),
    todayOverdue: "0.00",
    outstandingBalance: decimalToStr(totalOutstanding._sum.totalPrincipal),
    customerCount: allCustomers,
    activeLoanCount: activeLoans,
    overdueRate,
    funderBalance: decimalToStr(funderBalances._sum.balance),
    pendingConfirmRepayment,
    pendingSignContract,
    pendingDisbursement,
    riskCustomerCount: 0,
  });
}
