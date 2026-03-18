import { NextResponse } from "next/server";
import { scanOverdueItems } from "@/services/overdue.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/overdue — Vercel Cron 触发逾期扫描
 *
 * vercel.json 中配置:
 * { "crons": [{ "path": "/api/cron/overdue", "schedule": "0 0 * * *" }] }
 *
 * 本地测试可直接 GET 调用（需带 CRON_SECRET 头）
 */
export async function GET(req: Request) {
  // 验证 cron 密钥（防止外部恶意调用）
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
