import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id } = await params;
  const repayment = await prisma.repayment.findUnique({
    where: { id },
    select: {
      id: true,
      repaymentNo: true,
      amount: true,
      status: true,
    },
  });
  if (!repayment) {
    return NextResponse.json({ error: "还款记录不存在" }, { status: 404 });
  }
  return NextResponse.json({
    id: repayment.id,
    repaymentNo: repayment.repaymentNo,
    amount: Number(repayment.amount),
    status: repayment.status,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["repayment:allocate"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const repayment = await prisma.repayment.findUnique({
    where: { id },
    include: {
      allocations: { select: { id: true } },
      confirmation: { select: { id: true } },
    },
  });

  if (!repayment) {
    return NextResponse.json({ error: "还款记录不存在" }, { status: 404 });
  }

  if (repayment.status === "CONFIRMED") {
    return NextResponse.json({ error: "已确认到账的还款不能删除" }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    if (repayment.confirmation) {
      await tx.repaymentConfirmation.delete({
        where: { repaymentId: id },
      });
    }

    if (repayment.allocations.length > 0) {
      await tx.repaymentAllocation.deleteMany({
        where: { repaymentId: id },
      });
    }

    await tx.repayment.delete({
      where: { id },
    });
  });

  await writeAuditLog({
    userId: session.sub,
    action: "delete",
    entityType: "repayment",
    entityId: id,
    oldValue: {
      repaymentNo: repayment.repaymentNo,
      status: repayment.status,
      amount: Number(repayment.amount),
    },
    changeSummary: "删除还款记录",
  }).catch(() => undefined);

  return NextResponse.json({ success: true });
}
