import { NextResponse } from "next/server";
import { scanOverdueItems } from "@/services/overdue.service";
import { writeAuditLog } from "@/lib/audit";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * POST /api/overdue/scan — 手动触发逾期扫描
 * 生产环境由高频 cron 调用；管理端手动触发必须具备 overdue:scan 权限。
 */
export async function POST(req: Request) {
  const session = await requirePermission(["overdue:scan"]);
  if (session instanceof Response) return session;

  const result = await scanOverdueItems();

  await writeAuditLog({
    userId: session.sub,
    action: "create",
    entityType: "overdue_scan",
    entityId: "batch",
    newValue: result as any,
    changeSummary: `逾期扫描: 新增${result.newOverdue}条, 更新${result.updatedOverdue}条`,
  }).catch(() => undefined);

  return NextResponse.json(result);
}
