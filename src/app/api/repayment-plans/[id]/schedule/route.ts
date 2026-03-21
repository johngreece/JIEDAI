import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

type ScheduleItemLite = {
  id: string;
  periodNumber: number;
  dueDate: Date;
  principal: unknown;
  interest: unknown;
  fee: unknown;
  totalDue: unknown;
  remaining: unknown;
  status: string;
  paidAt: Date | null;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["repayment:view"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const plan = await prisma.repaymentPlan.findUnique({ where: { id } });
  if (!plan) return NextResponse.json({ error: "还款计划不存在" }, { status: 404 });

  const items = await prisma.repaymentScheduleItem.findMany({
    where: { planId: id },
    orderBy: { periodNumber: "asc" },
  });
  const typedItems = items as ScheduleItemLite[];

  return NextResponse.json({
    plan: {
      id: plan.id,
      planNo: plan.planNo,
      status: plan.status,
      totalPeriods: plan.totalPeriods,
    },
    items: typedItems.map((x: ScheduleItemLite) => ({
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
