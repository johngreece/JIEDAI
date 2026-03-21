import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requirePermission(["repayment:view"]);
  if (session instanceof Response) return session;

  const list = await prisma.repayment.findMany({
    where: { status: { in: ["PENDING_CONFIRM", "CUSTOMER_CONFIRMED"] } },
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
