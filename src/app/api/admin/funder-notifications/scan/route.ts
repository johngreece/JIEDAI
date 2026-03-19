import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { FunderNotificationService } from "@/services/funder-notification.service";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/funder-notifications/scan
 * 管理端触发利息到期扫描
 */
export async function POST() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const result = await FunderNotificationService.scanInterestMaturity();
  return NextResponse.json(result);
}
