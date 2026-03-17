import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { confirmRepayment } from "@/lib/repayment-confirm";
import { z } from "zod";

const bodySchema = z.object({
  confirmedAmount: z.string(),
  confirmedUsage: z.string().optional(),
  result: z.enum(["confirmed", "rejected"]),
  ipAddress: z.string().optional(),
  deviceInfo: z.string().optional(),
  signImageUrl: z.string().optional(),
  signData: z.record(z.unknown()).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { customerId: true },
  });
  const customerId = user?.customerId;
  if (!customerId) {
    return NextResponse.json(
      { error: "当前用户未关联客户，无法确认还款" },
      { status: 403 }
    );
  }

  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? undefined;

  try {
    await confirmRepayment({
      repaymentId: id,
      customerId,
      confirmedAmount: parsed.data.confirmedAmount,
      confirmedUsage: parsed.data.confirmedUsage,
      result: parsed.data.result,
      ipAddress: parsed.data.ipAddress ?? ip,
      deviceInfo: parsed.data.deviceInfo,
      signImageUrl: parsed.data.signImageUrl,
      signData: parsed.data.signData,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Confirm failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
