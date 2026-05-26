import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { ClientNotificationService } from "@/services/client-notification.service";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await requirePermission(["dashboard:view"]);
  if (session instanceof Response) return session;

  const result = await ClientNotificationService.scanAll();
  return NextResponse.json(result);
}
