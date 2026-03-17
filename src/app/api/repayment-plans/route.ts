import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;

  const plans = await prisma.repaymentPlan.findMany({
    where: {
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const apps = plans.length
    ? await prisma.loanApplication.findMany({
        where: { id: { in: plans.map((x) => x.applicationId) } },
        select: {
          id: true,
          applicationNo: true,
          customer: { select: { id: true, name: true, phone: true } },
          product: { select: { id: true, name: true } },
        },
      })
    : [];
  const appMap = new Map(apps.map((x) => [x.id, x]));

  return NextResponse.json({
    items: plans.map((x) => ({
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
