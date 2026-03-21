import { NextResponse } from "next/server";
import { getClientSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type AppLite = { id: string; applicationNo: string; product: { name: string } };
type PlanLite = { id: string; applicationId: string; planNo: string };
type AllocationLite = { id: string; itemId: string; amount: unknown; type: string };
type RepaymentLite = {
  id: string;
  repaymentNo: string;
  amount: unknown;
  status: string;
  receivedAt: Date | null;
  planId: string;
  allocations: AllocationLite[];
};

export async function GET() {
  const session = await getClientSession();
  if (!session) return NextResponse.json({ error: "请先登录客户端" }, { status: 401 });

  const apps = await prisma.loanApplication.findMany({
    where: { customerId: session.sub, deletedAt: null },
    select: { id: true, applicationNo: true, product: { select: { name: true } } },
  });
  const typedApps = apps as AppLite[];
  const appMap = new Map<string, AppLite>(typedApps.map((x: AppLite) => [x.id, x]));

  const plans = await prisma.repaymentPlan.findMany({
    where: { applicationId: { in: typedApps.map((x: AppLite) => x.id) } },
    select: { id: true, applicationId: true, planNo: true },
  });
  const typedPlans = plans as PlanLite[];
  const planMap = new Map<string, PlanLite>(typedPlans.map((x: PlanLite) => [x.id, x]));

  const repayments = await prisma.repayment.findMany({
    where: {
      planId: { in: typedPlans.map((x: PlanLite) => x.id) },
      status: { in: ["PENDING_CONFIRM", "CUSTOMER_CONFIRMED"] },
    },
    orderBy: { createdAt: "desc" },
    include: { allocations: { select: { id: true, itemId: true, amount: true, type: true } } },
  });
  const typedRepayments = repayments as RepaymentLite[];

  return NextResponse.json({
    items: typedRepayments.map((x: RepaymentLite) => {
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
        allocations: x.allocations.map((a: AllocationLite) => ({ ...a, amount: Number(a.amount) })),
      };
    }),
  });
}
