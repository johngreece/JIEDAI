import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  calculateLiveOutstandingFromSnapshot,
  extractPaidDates,
} from "@/lib/repayment-runtime";
import { deriveRepaymentOpenComponents } from "@/lib/repayment-allocation";

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
  remainingPrincipal: unknown;
  remainingInterest: unknown;
  remainingFee: unknown;
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
  const plan = await prisma.repaymentPlan.findUnique({
    where: { id },
    select: {
      id: true,
      planNo: true,
      status: true,
      totalPeriods: true,
      applicationId: true,
      totalPrincipal: true,
      rulesSnapshotJson: true,
    },
  });
  if (!plan) return NextResponse.json({ error: "还款计划不存在" }, { status: 404 });
  const application = await prisma.loanApplication.findUnique({
    where: { id: plan.applicationId },
    select: {
      disbursement: {
        select: {
          disbursedAt: true,
        },
      },
    },
  });

  const items = await prisma.repaymentScheduleItem.findMany({
    where: { planId: id },
    orderBy: { periodNumber: "asc" },
  });
  const typedItems = items as ScheduleItemLite[];

  const liveRemainingByItem = new Map<string, number>();
  if (typedItems.length === 1) {
    const confirmedRepayments = await prisma.repayment.findMany({
      where: {
        planId: id,
        status: "CONFIRMED",
      },
      select: { amount: true },
    });
    const confirmedAmount = confirmedRepayments.reduce((sum, item) => sum + Number(item.amount), 0);

    const overdueRecord = await prisma.overdueRecord.findFirst({
      where: {
        scheduleItemId: typedItems[0].id,
        status: "OVERDUE",
      },
      orderBy: { createdAt: "desc" },
      select: { overdueFeeDetail: true },
    });

    const liveOutstanding = application
      ? calculateLiveOutstandingFromSnapshot({
          rulesSnapshotJson: plan.rulesSnapshotJson,
          principal: Number(plan.totalPrincipal),
          disbursedAt: application.disbursement?.disbursedAt,
          paymentTime: new Date(),
          paidDates: extractPaidDates(overdueRecord?.overdueFeeDetail),
        })
      : null;

    if (liveOutstanding != null) {
      liveRemainingByItem.set(
        typedItems[0].id,
        Math.max(0, liveOutstanding - confirmedAmount),
      );
    }
  }

  return NextResponse.json({
    plan: {
      id: plan.id,
      planNo: plan.planNo,
      status: plan.status,
      totalPeriods: plan.totalPeriods,
    },
    items: typedItems.map((x: ScheduleItemLite) => {
      const remaining = liveRemainingByItem.get(x.id) ?? Number(x.remaining);
      const components = deriveRepaymentOpenComponents(x, remaining);
      return {
        id: x.id,
        periodNumber: x.periodNumber,
        dueDate: x.dueDate,
        principal: components.principal,
        interest: components.interest,
        fee: components.fee,
        penalty: components.penalty,
        totalDue: Number(x.totalDue),
        remaining,
        remainingPrincipal: components.principal,
        remainingInterest: components.interest,
        remainingFee: components.fee,
        status: x.status,
        paidAt: x.paidAt,
      };
    }),
  });
}
