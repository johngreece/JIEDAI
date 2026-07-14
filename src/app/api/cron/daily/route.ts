import { NextResponse } from "next/server";
import { ensureCronAuthorized } from "@/lib/cron-auth";
import { runDailyMaintenance } from "@/services/daily-maintenance.service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = ensureCronAuthorized(req);
  if (denied) return denied;

  const result = await runDailyMaintenance();
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

export async function POST(req: Request) {
  return GET(req);
}
