import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkIdempotencyKey, getScopedIdempotencyKey, saveIdempotencyResult } from "@/lib/idempotency";
import { requirePermission } from "@/lib/rbac";
import { FunderInterestSettlementService } from "@/services/funder-interest-settlement.service";

export const dynamic = "force-dynamic";

const postSchema = z.object({
  action: z.enum(["generate_due", "mark_paid"]),
  settlementId: z.string().optional(),
  remark: z.string().max(500).optional(),
});

export async function GET(req: NextRequest) {
  const session = await requirePermission(["ledger:view"]);
  if (session instanceof Response) return session;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const items = await FunderInterestSettlementService.listForAdmin(status);

  return NextResponse.json({
    items,
    summary: FunderInterestSettlementService.summarize(items),
  });
}

export async function POST(req: NextRequest) {
  const session = await requirePermission(["ledger:view"]);
  if (session instanceof Response) return session;

  const body = await req.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const idemKey = getScopedIdempotencyKey(req, [
    "admin",
    session.sub,
    "funder-interest-settlement",
    parsed.data.action,
    parsed.data.settlementId ?? "all",
  ]);
  const cached = await checkIdempotencyKey(idemKey);
  if (cached) return NextResponse.json(cached);

  try {
    const result =
      parsed.data.action === "generate_due"
        ? await FunderInterestSettlementService.generateDueSettlements()
        : await FunderInterestSettlementService.markPaidByPlatform(
            parsed.data.settlementId ?? "",
            session.sub,
            parsed.data.remark,
          );

    await saveIdempotencyResult(idemKey, result);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "资金方收益结算操作失败" },
      { status: 400 },
    );
  }
}
