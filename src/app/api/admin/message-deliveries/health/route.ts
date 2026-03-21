import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { MessageDeliveryMonitorService } from "@/services/message-delivery-monitor.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requirePermission(["audit:view"]);
  if (session instanceof Response) return session;

  const overview = await MessageDeliveryMonitorService.getOverview();
  return NextResponse.json(overview);
}
