import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });

  const list = await prisma.repayment.findMany({
    where: { status: "PENDING_CONFIRM" },
    orderBy: { createdAt: "desc" },
    include: {
      plan: { select: { id: true, planNo: true, applicationId: true } },
      allocations: { select: { id: true, itemId: true, amount: true, type: true } },
    },
    take: 200,
  });

  const appIds = list.map((x) => x.plan.applicationId);
  const apps = appIds.length
    ? await prisma.loanApplication.findMany({
        where: { id: { in: appIds } },
        select: {
          id: true,
          applicationNo: true,
          customer: { select: { id: true, name: true, phone: true } },
        },
      })
    : [];
  const appMap = new Map(apps.map((x) => [x.id, x]));

  return NextResponse.json({
    items: list.map((x) => ({
      id: x.id,
      repaymentNo: x.repaymentNo,
      amount: Number(x.amount),
      status: x.status,
      receivedAt: x.receivedAt,
      plan: x.plan,
      application: appMap.get(x.plan.applicationId) ?? null,
      allocations: x.allocations.map((a) => ({ ...a, amount: Number(a.amount) })),
    })),
  });
}
