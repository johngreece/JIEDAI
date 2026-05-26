import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkIdempotencyKey, getScopedIdempotencyKey, saveIdempotencyResult } from "@/lib/idempotency";
import { requireActiveFunderSession } from "@/lib/portal-session";
import { FunderInterestSettlementService } from "@/services/funder-interest-settlement.service";

export const dynamic = "force-dynamic";

const actionSchema = z.object({
  settlementId: z.string().min(1),
  action: z.enum(["confirm_received", "not_received"]),
  reason: z.string().trim().max(500).optional(),
});

export async function GET(req: NextRequest) {
  const session = await requireActiveFunderSession();
  if (session instanceof Response) return session;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const items = await FunderInterestSettlementService.listForFunder(session.sub, status);

  return NextResponse.json({
    items,
    summary: FunderInterestSettlementService.summarize(items),
  });
}

export async function POST(req: NextRequest) {
  const session = await requireActiveFunderSession();
  if (session instanceof Response) return session;

  const body = await req.json().catch(() => ({}));
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const idemKey = getScopedIdempotencyKey(req, [
    "funder",
    session.sub,
    "interest-settlement",
    parsed.data.settlementId,
    parsed.data.action,
  ]);
  const cached = await checkIdempotencyKey(idemKey);
  if (cached) return NextResponse.json(cached);

  try {
    const result =
      parsed.data.action === "confirm_received"
        ? await FunderInterestSettlementService.confirmByFunder(parsed.data.settlementId, session.sub)
        : await FunderInterestSettlementService.rejectByFunder(
            parsed.data.settlementId,
            session.sub,
            parsed.data.reason || "资金方反馈未收到该笔利息",
          );

    await saveIdempotencyResult(idemKey, result);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "收益确认失败" },
      { status: 400 },
    );
  }
}
