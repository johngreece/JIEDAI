import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkIdempotencyKey, getScopedIdempotencyKey, saveIdempotencyResult } from "@/lib/idempotency";
import { requirePermission } from "@/lib/rbac";
import { FunderInterestSettlementService } from "@/services/funder-interest-settlement.service";

export const dynamic = "force-dynamic";

const postSchema = z.object({
  action: z.enum(["generate_due", "mark_paid"]),
  settlementId: z.string().trim().optional(),
  remark: z.string().trim().max(500).optional(),
});

export async function GET(req: NextRequest) {
  const session = await requirePermission(["ledger:view"]);
  if (session instanceof Response) return session;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const normalizedStatus = status && status !== "all" ? status : null;
  const items = await FunderInterestSettlementService.listForAdmin(normalizedStatus);
  const summaryItems = normalizedStatus ? await FunderInterestSettlementService.listForAdmin(null) : items;

  return NextResponse.json({
    items,
    summary: FunderInterestSettlementService.summarize(summaryItems),
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

  const settlementId = parsed.data.settlementId;
  const paymentRemark = parsed.data.remark;
  if (parsed.data.action === "mark_paid") {
    if (!settlementId) {
      return NextResponse.json({ error: "请选择要标记打款的结算单" }, { status: 400 });
    }
    if (!paymentRemark) {
      return NextResponse.json({ error: "请填写平台打款流水号或付款备注" }, { status: 400 });
    }
  }

  const idemKey = getScopedIdempotencyKey(req, [
    "admin",
    session.sub,
    "funder-interest-settlement",
    parsed.data.action,
    settlementId ?? "all",
  ]);
  const cached = await checkIdempotencyKey(idemKey);
  if (cached) return NextResponse.json(cached);

  try {
    const result =
      parsed.data.action === "generate_due"
        ? await FunderInterestSettlementService.generateDueSettlements()
        : await FunderInterestSettlementService.markPaidByPlatform(
            settlementId ?? "",
            session.sub,
            paymentRemark,
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
