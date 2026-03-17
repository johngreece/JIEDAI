import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });
  }

  const { id } = await params;
  const application = await prisma.loanApplication.findUnique({ where: { id } });
  if (!application || application.deletedAt) {
    return NextResponse.json({ error: "申请不存在" }, { status: 404 });
  }

  if (!["DRAFT", "REJECTED"].includes(application.status)) {
    return NextResponse.json({ error: "当前状态不允许提交" }, { status: 400 });
  }

  const updated = await prisma.loanApplication.update({
    where: { id },
    data: {
      status: "PENDING_RISK",
      rejectedReason: null,
      rejectedAt: null,
    },
  });

  await writeAuditLog({
    userId: session.sub,
    action: "update",
    entityType: "loan_application",
    entityId: id,
    oldValue: { status: application.status },
    newValue: { status: updated.status },
    changeSummary: "提交至风控审核",
  }).catch(() => undefined);

  return NextResponse.json({ id: updated.id, status: updated.status });
}
