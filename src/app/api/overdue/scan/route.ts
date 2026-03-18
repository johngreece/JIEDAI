import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { scanOverdueItems } from "@/services/overdue.service";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/overdue/scan — 手动触发逾期扫描
 * 生产环境应由定时任务 (cron) 每日调用
 */
export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });
  }

  const result = await scanOverdueItems();

  await writeAuditLog({
    userId: session.sub,
    action: "create",
    entityType: "overdue_scan" as any,
    entityId: "batch",
    newValue: result as any,
    changeSummary: `逾期扫描: 新增${result.newOverdue}条, 更新${result.updatedOverdue}条`,
  }).catch(() => undefined);

  return NextResponse.json(result);
}
