import { NextRequest, NextResponse } from "next/server";
import { requireActiveClientSession } from "@/lib/portal-session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireActiveClientSession();
  if (session instanceof Response) return session;

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
  const userAgent = req.headers.get("user-agent");
  const confirmedAt = new Date();
  const evidence = {
    action: "CLIENT_CONFIRM_RECEIVED",
    portal: "client",
    customerId: session.sub,
    applicationId: disbursement.applicationId,
    disbursementNo: disbursement.disbursementNo,
    amount: Number(disbursement.amount),
    netAmount: Number(disbursement.netAmount),
    previousStatus: disbursement.status,
    confirmedAt: confirmedAt.toISOString(),
    ipAddress: ip,
    userAgent,
  };

  const claimed = await prisma.disbursement.updateMany({
    where: { id, status: "PAID", customerConfirmedAt: null },
    data: {
      status: "CONFIRMED",
      customerConfirmIp: ip,
      customerConfirmedAt: confirmedAt,
      customerConfirmUserAgent: userAgent,
      customerConfirmEvidenceJson: JSON.stringify(evidence),
    },
  });
  if (claimed.count !== 1) {
    return NextResponse.json(
      { error: "放款状态已变化，请刷新后重试" },
      { status: 409 },
    );
  }

  const updated = await prisma.disbursement.findUniqueOrThrow({ where: { id } });

  return NextResponse.json({
    ok: true,
    id: updated.id,
    status: updated.status,
    customerConfirmedAt: updated.customerConfirmedAt,
  });
}
