import { NextResponse } from "next/server";
import { MessageDeliveryService } from "@/services/message-delivery.service";
import { ensureCronAuthorized } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = ensureCronAuthorized(req);
  if (denied) return denied;

  const limitParam = Number(new URL(req.url).searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(1, limitParam), 500) : 50;
  const result = await MessageDeliveryService.processRetryQueue(limit);
  return NextResponse.json({ ok: true, result, timestamp: new Date().toISOString() });
}

export async function POST(req: Request) {
  return GET(req);
}
