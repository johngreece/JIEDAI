import { NextRequest, NextResponse } from "next/server";
import { getClientSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录客户端" }, { status: 401 });
  }

  const { id } = await params;

  const disbursement = await prisma.disbursement.findUnique({
    where: { id },
    include: {
      application: {
        select: { id: true, customerId: true },
      },
    },
  });

  if (!disbursement) {
    return NextResponse.json({ error: "放款记录不存在" }, { status: 404 });
  }

  if (disbursement.application.customerId !== session.sub) {
    return NextResponse.json({ error: "无权操作该放款记录" }, { status: 403 });
  }

  if (disbursement.status !== "PAID") {
    return NextResponse.json({ error: "当前状态不允许确认收款" }, { status: 400 });
  }

  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";

  const updated = await prisma.disbursement.update({
    where: { id },
    data: {
      status: "CONFIRMED",
      customerConfirmIp: ip,
    },
  });

  await writeAuditLog({
    userId: session.sub,
    action: "confirm",
    entityType: "disbursement",
    entityId: id,
    oldValue: { status: disbursement.status },
    newValue: { status: updated.status, customerConfirmIp: updated.customerConfirmIp },
    changeSummary: "客户端确认已收款",
    ipAddress: ip,
    userAgent: req.headers.get("user-agent"),
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, id: updated.id, status: updated.status });
}
