import { NextRequest, NextResponse } from "next/server";
import { getClientSession } from "@/lib/auth";
import { confirmRepayment } from "@/lib/repayment-confirm";
import { z } from "zod";

const bodySchema = z.object({
  action: z.enum(["CONFIRMED", "REJECTED"]),
  signatureData: z.string().optional(),
  rejectReason: z.string().optional(),
  deviceInfo: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录客户端" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const customerId = session.sub;

  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";

  try {
    await confirmRepayment({
      repaymentId: id,
      customerId,
      action: parsed.data.action,
      signatureData: parsed.data.signatureData,
      rejectReason: parsed.data.rejectReason,
      ipAddress: ip,
      deviceInfo: parsed.data.deviceInfo,
      operatorId: customerId,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Confirm failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
