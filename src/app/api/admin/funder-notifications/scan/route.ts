import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { FunderNotificationService } from "@/services/funder-notification.service";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/funder-notifications/scan
 * 管理端触发利息到期扫描
 */
export async function POST() {
  const session = await requirePermission(["dashboard:view"]);
  if (session instanceof Response) return session;

  const result = await FunderNotificationService.scanInterestMaturity();
  return NextResponse.json(result);
}
