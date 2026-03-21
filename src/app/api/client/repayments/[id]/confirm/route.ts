import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientSession } from "@/lib/auth";
import { confirmRepayment } from "@/lib/repayment-confirm";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["CONFIRMED", "DECLARED_PAID", "REJECTED"]).default("DECLARED_PAID"),
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

  const forwarded = req.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await confirmRepayment({
      repaymentId: id,
      customerId: session.sub,
      action: parsed.data.action,
      signatureData: parsed.data.signatureData,
      rejectReason: parsed.data.rejectReason,
      ipAddress: ip,
      deviceInfo: parsed.data.deviceInfo,
      operatorId: session.sub,
    });

    return NextResponse.json({
      ok: true,
      status: parsed.data.action === "REJECTED" ? "REJECTED" : "CUSTOMER_CONFIRMED",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Confirm failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
