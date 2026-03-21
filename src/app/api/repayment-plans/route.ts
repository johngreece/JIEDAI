import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

type PlanLite = {
  id: string;
  planNo: string;
  applicationId: string;
  totalPrincipal: unknown;
  totalInterest: unknown;
  totalFee: unknown;
  totalPeriods: number;
  status: string;
};

type AppLite = {
  id: string;
  applicationNo: string;
  customer: { id: string; name: string; phone: string };
  product: { id: string; name: string };
};

export async function GET(req: Request) {
  const session = await requirePermission(["repayment:view"]);
  if (session instanceof Response) return session;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;

  const plans = await prisma.repaymentPlan.findMany({
    where: {
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const typedPlans = plans as PlanLite[];

  const apps = typedPlans.length
    ? await prisma.loanApplication.findMany({
        where: { id: { in: typedPlans.map((x: PlanLite) => x.applicationId) } },
        select: {
          id: true,
          applicationNo: true,
          customer: { select: { id: true, name: true, phone: true } },
          product: { select: { id: true, name: true } },
        },
      })
    : [];
  const typedApps = apps as AppLite[];
  const appMap = new Map<string, AppLite>(typedApps.map((x: AppLite) => [x.id, x]));

  return NextResponse.json({
    items: typedPlans.map((x: PlanLite) => ({
      id: x.id,
      planNo: x.planNo,
      applicationId: x.applicationId,
      totalPrincipal: Number(x.totalPrincipal),
      totalInterest: Number(x.totalInterest),
      totalFee: Number(x.totalFee),
      totalPeriods: x.totalPeriods,
      status: x.status,
      application: appMap.get(x.applicationId) ?? null,
    })),
  });
}
