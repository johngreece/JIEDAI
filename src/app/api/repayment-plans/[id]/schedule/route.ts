import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });

  const { id } = await params;
  const plan = await prisma.repaymentPlan.findUnique({ where: { id } });
  if (!plan) return NextResponse.json({ error: "还款计划不存在" }, { status: 404 });

  const items = await prisma.repaymentScheduleItem.findMany({
    where: { planId: id },
    orderBy: { periodNumber: "asc" },
  });

  return NextResponse.json({
    plan: {
      id: plan.id,
      planNo: plan.planNo,
      status: plan.status,
      totalPeriods: plan.totalPeriods,
    },
    items: items.map((x) => ({
      id: x.id,
      periodNumber: x.periodNumber,
      dueDate: x.dueDate,
      principal: Number(x.principal),
      interest: Number(x.interest),
      fee: Number(x.fee),
      totalDue: Number(x.totalDue),
      remaining: Number(x.remaining),
      status: x.status,
      paidAt: x.paidAt,
    })),
  });
}
