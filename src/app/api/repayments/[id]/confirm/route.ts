import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { settleRepaymentReceipt } from "@/lib/repayment-confirm";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["RECEIVED", "NOT_RECEIVED"]),
  rejectReason: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["repayment:allocate"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数错误", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const repayment = await settleRepaymentReceipt({
      repaymentId: id,
      operatorId: session.sub,
      action: parsed.data.action,
      rejectReason: parsed.data.rejectReason,
    });

    return NextResponse.json({
      id: repayment.id,
      status: repayment.status,
      receivedAt: repayment.receivedAt?.toISOString() ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Confirm failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
