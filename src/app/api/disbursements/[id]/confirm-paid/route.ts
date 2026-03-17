import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

function genPlanNo() {
  return `RP${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });
  }

  const { id } = await params;
  const current = await prisma.disbursement.findUnique({
    where: { id },
    include: { application: true },
  });

  if (!current) {
    return NextResponse.json({ error: "放款单不存在" }, { status: 404 });
  }
  if (current.status !== "PENDING") {
    return NextResponse.json({ error: "当前状态不允许确认打款" }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const disbursement = await tx.disbursement.update({
      where: { id },
      data: {
        status: "PAID",
        disbursedAt: new Date(),
        operatorId: session.sub,
      },
    });

    await tx.loanApplication.update({
      where: { id: disbursement.applicationId },
      data: { status: "DISBURSED" },
    });

    const existingPlan = await tx.repaymentPlan.findFirst({
      where: { applicationId: disbursement.applicationId },
      select: { id: true },
    });

    if (!existingPlan) {
      const plan = await tx.repaymentPlan.create({
        data: {
          planNo: genPlanNo(),
          applicationId: disbursement.applicationId,
          totalPrincipal: disbursement.amount,
          totalInterest: 0,
          totalFee: disbursement.feeAmount,
          totalPeriods: 1,
          status: "ACTIVE",
        },
      });

      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + 1);

      const totalDue = Number(disbursement.amount) + Number(disbursement.feeAmount);
      await tx.repaymentScheduleItem.create({
        data: {
          planId: plan.id,
          periodNumber: 1,
          dueDate,
          principal: disbursement.amount,
          interest: 0,
          fee: disbursement.feeAmount,
          totalDue,
          remaining: totalDue,
          status: "PENDING",
        },
      });
    }

    return disbursement;
  });

  await writeAuditLog({
    userId: session.sub,
    action: "disburse",
    entityType: "disbursement",
    entityId: id,
    oldValue: { status: current.status },
    newValue: { status: result.status, disbursedAt: result.disbursedAt?.toISOString() ?? null },
    changeSummary: "确认已打款",
  }).catch(() => undefined);

  return NextResponse.json({ id: result.id, status: result.status });
}
