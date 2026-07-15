import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getScopedIdempotencyKey, withIdempotencyResponse } from "@/lib/idempotency";
import { requirePermission } from "@/lib/rbac";
import { FunderInterestSettlementService } from "@/services/funder-interest-settlement.service";

export const dynamic = "force-dynamic";

const postSchema = z.object({
  action: z.enum(["generate_due", "post_settlement"]),
  settlementId: z.string().trim().optional(),
  remark: z.string().trim().max(500).optional(),
});

export async function GET(req: NextRequest) {
  const session = await requirePermission(["settlement:view"]);
  if (session instanceof Response) return session;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const normalizedStatus = status && status !== "all" ? status : null;
  const format = url.searchParams.get("format") ?? "json";
  const filters = {
    startDate: url.searchParams.get("startDate") ?? url.searchParams.get("start"),
    endDate: url.searchParams.get("endDate") ?? url.searchParams.get("end"),
    take: format === "csv" ? 5000 : 300,
  };
  const items = await FunderInterestSettlementService.listForAdmin(normalizedStatus, filters);
  const summaryItems = normalizedStatus ? await FunderInterestSettlementService.listForAdmin(null, filters) : items;
  const payload = {
    items,
    summary: FunderInterestSettlementService.summarize(summaryItems),
    filters: FunderInterestSettlementService.describeListFilters(filters),
  };

  if (format === "csv") {
    const csv = FunderInterestSettlementService.toCSV(payload);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="admin_funder_interest_settlements_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return NextResponse.json(payload);
}

export async function POST(req: NextRequest) {
  const session = await requirePermission(["settlement:manage"]);
  if (session instanceof Response) return session;

  const body = await req.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const settlementId = parsed.data.settlementId;
  const postingRemark = parsed.data.remark;
  if (parsed.data.action === "post_settlement") {
    if (!settlementId) {
      return NextResponse.json({ error: "请选择要发布的结算单" }, { status: 400 });
    }
    if (!postingRemark) {
      return NextResponse.json({ error: "请填写收益结算说明" }, { status: 400 });
    }
  }

  const idemKey = getScopedIdempotencyKey(req, [
    "admin",
    session.sub,
    "funder-interest-settlement",
    parsed.data.action,
    settlementId ?? "all",
  ]);
  return withIdempotencyResponse(idemKey, async () => {
    try {
      const result =
        parsed.data.action === "generate_due"
          ? await FunderInterestSettlementService.generateDueSettlements()
          : await FunderInterestSettlementService.postByPlatform(
              settlementId ?? "",
              session.sub,
              postingRemark,
            );

      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "资金方收益结算操作失败";
      return NextResponse.json(
        { error: message },
        { status: message.includes("状态已变化") ? 409 : 400 },
      );
    }
  });
}
