import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { ClientNotificationService } from "@/services/client-notification.service";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await ClientNotificationService.scanAll();
  return NextResponse.json(result);
}
