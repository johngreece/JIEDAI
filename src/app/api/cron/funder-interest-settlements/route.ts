import { NextResponse } from "next/server";
import { ensureCronAuthorized } from "@/lib/cron-auth";
import { FunderInterestSettlementService } from "@/services/funder-interest-settlement.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/funder-interest-settlements
 * 自动生成到期的资金方收益结算单，并通知资金方与管理端处理。
 */
export async function GET(req: Request) {
  const denied = ensureCronAuthorized(req);
  if (denied) return denied;

  try {
    const result = await FunderInterestSettlementService.generateDueSettlements();

    return NextResponse.json({
      success: true,
      funderInterestSettlements: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Funder interest settlement cron failed",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}
