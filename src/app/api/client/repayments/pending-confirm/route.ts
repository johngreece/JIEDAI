import { NextResponse } from "next/server";
import { getClientSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getClientSession();
  if (!session) return NextResponse.json({ error: "请先登录客户端" }, { status: 401 });

  const apps = await prisma.loanApplication.findMany({
    where: { customerId: session.sub, deletedAt: null },
    select: { id: true, applicationNo: true, product: { select: { name: true } } },
  });
  const appMap = new Map(apps.map((x) => [x.id, x]));

  const plans = await prisma.repaymentPlan.findMany({
    where: { applicationId: { in: apps.map((x) => x.id) } },
    select: { id: true, applicationId: true, planNo: true },
  });
  const planMap = new Map(plans.map((x) => [x.id, x]));

  const repayments = await prisma.repayment.findMany({
    where: {
      planId: { in: plans.map((x) => x.id) },
      status: "PENDING_CONFIRM",
    },
    orderBy: { createdAt: "desc" },
    include: { allocations: { select: { id: true, itemId: true, amount: true, type: true } } },
  });

  return NextResponse.json({
    items: repayments.map((x) => {
      const plan = planMap.get(x.planId);
      const app = plan ? appMap.get(plan.applicationId) : null;
      return {
        id: x.id,
        repaymentNo: x.repaymentNo,
        amount: Number(x.amount),
        status: x.status,
        receivedAt: x.receivedAt,
        plan: plan ?? null,
        application: app ?? null,
        allocations: x.allocations.map((a) => ({ ...a, amount: Number(a.amount) })),
      };
    }),
  });
}
