import { NextRequest, NextResponse } from "next/server";
import { SettlementService } from "@/services/settlement.service";
import { requirePermission } from "@/lib/rbac";

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
