import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });
  }

  const { id } = await params;

  const disbursement = await prisma.disbursement.findUnique({
    where: { id },
    include: {
      application: {
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          product: { select: { id: true, name: true } },
        },
      },
      fundAccount: {
        include: { funder: { select: { id: true, name: true } } },
      },
    },
  });

  if (!disbursement) {
    return NextResponse.json({ error: "放款单不存在" }, { status: 404 });
  }

  const plan = await prisma.repaymentPlan.findFirst({
    where: { applicationId: disbursement.applicationId },
    orderBy: { createdAt: "desc" },
  });

  const scheduleItems = plan
    ? await prisma.repaymentScheduleItem.findMany({
        where: { planId: plan.id },
        orderBy: { periodNumber: "asc" },
      })
    : [];

  return NextResponse.json({
    id: disbursement.id,
    disbursementNo: disbursement.disbursementNo,
    status: disbursement.status,
    amount: Number(disbursement.amount),
    feeAmount: Number(disbursement.feeAmount),
    netAmount: Number(disbursement.netAmount),
    disbursedAt: disbursement.disbursedAt,
    remark: disbursement.remark,
    application: {
      id: disbursement.application.id,
      applicationNo: disbursement.application.applicationNo,
      status: disbursement.application.status,
      customer: disbursement.application.customer,
      product: disbursement.application.product,
    },
    fundAccount: {
      id: disbursement.fundAccount.id,
      accountName: disbursement.fundAccount.accountName,
      bankName: disbursement.fundAccount.bankName,
      accountNo: disbursement.fundAccount.accountNo,
      balance: Number(disbursement.fundAccount.balance),
      funder: disbursement.fundAccount.funder,
    },
    repaymentPlan: plan
      ? {
          id: plan.id,
          planNo: plan.planNo,
          totalPrincipal: Number(plan.totalPrincipal),
          totalInterest: Number(plan.totalInterest),
          totalFee: Number(plan.totalFee),
          totalPeriods: plan.totalPeriods,
          status: plan.status,
          items: scheduleItems.map((x: {
            id: string;
            periodNumber: number;
            dueDate: Date;
            principal: unknown;
            interest: unknown;
            fee: unknown;
            totalDue: unknown;
            remaining: unknown;
            status: string;
          }) => ({
            id: x.id,
            periodNumber: x.periodNumber,
            dueDate: x.dueDate,
            principal: Number(x.principal),
            interest: Number(x.interest),
            fee: Number(x.fee),
            totalDue: Number(x.totalDue),
            remaining: Number(x.remaining),
            status: x.status,
          })),
        }
      : null,
  });
}
