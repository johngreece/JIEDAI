import { NextResponse } from "next/server";
import { scanOverdueItems } from "@/services/overdue.service";
import { ensureCronAuthorized } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/overdue — Vercel Cron 触发逾期扫描
 *
 * vercel.json 中配置:
 * { "crons": [{ "path": "/api/cron/overdue", "schedule": "0 0 * * *" }] }
 *
 * 本地测试需携带：Authorization: Bearer ${CRON_SECRET}
 */
export async function GET(req: Request) {
  const denied = ensureCronAuthorized(req);
  if (denied) return denied;

  try {
    const result = await scanOverdueItems();

    console.log(
      `[CRON] overdue scan completed: new=${result.newOverdue}, updated=${result.updatedOverdue}`
    );

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON] overdue scan failed:", error);
    return NextResponse.json(
      { error: "逾期扫描执行失败", detail: error instanceof Error ? error.message : "unknown" },
      { status: 500 }
    );
  }
}
