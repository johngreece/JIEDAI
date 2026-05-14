import { NextRequest, NextResponse } from "next/server";
import { SettlementService } from "@/services/settlement.service";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

/**
 * GET /api/settlement?type=summary|daily|customer|funder|profit
 *     &start=2024-01-01&end=2024-12-31
 */
export async function GET(req: NextRequest) {
  const session = await requirePermission(["ledger:view"]);
  if (session instanceof Response) return session;

  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") || "summary";

  // 解析时间范围（默认本月）
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const start = sp.get("start") ? new Date(sp.get("start")!) : defaultStart;
  const end = sp.get("end") ? new Date(sp.get("end")!) : defaultEnd;

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: "无效的时间范围" }, { status: 400 });
  }

  const period = { start, end };

  switch (type) {
    case "summary": {
      const data = await SettlementService.generateReport(period);
      return NextResponse.json(data);
    }
    case "daily": {
      const data = await SettlementService.getDailyBreakdown(period);
      return NextResponse.json(data);
    }
    case "customer": {
      const data = await SettlementService.getCustomerSettlement(period);
      return NextResponse.json(data);
    }
    case "funder": {
      const data = await SettlementService.calculateFunderProfitShare(period);
      return NextResponse.json(data);
    }
    case "profit": {
      const data = await SettlementService.profitMaximizationAnalysis();
      return NextResponse.json(data);
    }
    default:
      return NextResponse.json({ error: "无效的 type 参数" }, { status: 400 });
  }
}

/**
 * POST /api/settlement
 *   body: { action: "persist-funder-shares", start, end }
 *           — compute funder profit for period and upsert PENDING FundProfitShare rows
 *         { action: "settle-funder-share", profitShareId, remark? }
 *           — mark a PENDING row SETTLED
 */
export async function POST(req: NextRequest) {
  const session = await requirePermission(["settings:edit", "ledger:view"]);
  if (session instanceof Response) return session;

  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  if (action === "persist-funder-shares") {
    const start = body?.start ? new Date(body.start) : null;
    const end = body?.end ? new Date(body.end) : null;
    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: "无效的 start/end 时间" }, { status: 400 });
    }
    const result = await SettlementService.persistFunderProfitShares({ start, end });
    await writeAuditLog({
      userId: session.sub,
      action: "settlement_persist",
      entityType: "fund_profit_share",
      entityId: `${start.toISOString()}_${end.toISOString()}`,
      newValue: result,
      changeSummary: `周期分润落账 ${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`,
    }).catch(() => undefined);
    return NextResponse.json(result);
  }

  if (action === "settle-funder-share") {
    const profitShareId = body?.profitShareId;
    if (!profitShareId || typeof profitShareId !== "string") {
      return NextResponse.json({ error: "缺少 profitShareId" }, { status: 400 });
    }
    try {
      const remark = typeof body?.remark === "string" ? body.remark : undefined;
      const updated = await SettlementService.markFunderProfitShareSettled(profitShareId, remark);
      await writeAuditLog({
        userId: session.sub,
        action: "settlement_settle",
        entityType: "fund_profit_share",
        entityId: profitShareId,
        newValue: { status: updated.status, settledAt: updated.settledAt },
        changeSummary: "标记分润为已结算",
      }).catch(() => undefined);
      return NextResponse.json({
        id: updated.id,
        status: updated.status,
        settledAt: updated.settledAt,
      });
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 409 });
    }
  }

  return NextResponse.json({ error: "无效的 action" }, { status: 400 });
}
