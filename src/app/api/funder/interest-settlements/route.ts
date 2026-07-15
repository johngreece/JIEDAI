import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getScopedIdempotencyKey, withIdempotencyResponse } from "@/lib/idempotency";
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
  const normalizedStatus = status && status !== "all" ? status : null;
  const format = url.searchParams.get("format") ?? "json";
  const filters = {
    startDate: url.searchParams.get("startDate") ?? url.searchParams.get("start"),
    endDate: url.searchParams.get("endDate") ?? url.searchParams.get("end"),
    take: format === "csv" ? 5000 : 200,
  };
  const items = await FunderInterestSettlementService.listForFunder(session.sub, normalizedStatus, filters);
  const summaryItems = normalizedStatus
    ? await FunderInterestSettlementService.listForFunder(session.sub, null, filters)
    : items;
  const payload = {
    items,
    summary: FunderInterestSettlementService.summarize(summaryItems),
    filters: FunderInterestSettlementService.describeListFilters(filters),
  };

  if (format === "csv") {
    const csv = FunderInterestSettlementService.toCSV({
      ...payload,
      funderName: session.name,
    });
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="funder_interest_settlements_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return NextResponse.json(payload);
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
  return withIdempotencyResponse(idemKey, async () => {

  try {
    const result =
      parsed.data.action === "confirm_received"
        ? await FunderInterestSettlementService.confirmByFunder(parsed.data.settlementId, session.sub)
        : await FunderInterestSettlementService.rejectByFunder(
            parsed.data.settlementId,
            session.sub,
            parsed.data.reason || "资金方反馈未收到该笔利息",
          );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "收益确认失败" },
      { status: 400 },
    );
  }
  });
}
