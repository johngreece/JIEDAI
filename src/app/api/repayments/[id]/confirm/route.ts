import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getScopedIdempotencyKey, withIdempotencyResponse } from "@/lib/idempotency";
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
  const idemKey = getScopedIdempotencyKey(req, ["admin", session.sub, "repayment-confirm", id]);
  return withIdempotencyResponse(idemKey, async () => {

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

    const responseBody = {
      id: repayment.id,
      status: repayment.status,
      receivedAt: repayment.receivedAt?.toISOString() ?? null,
    };
    return NextResponse.json(responseBody);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Confirm failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  });
}
