import { NextResponse } from "next/server";
import { MessageDeliveryService } from "@/services/message-delivery.service";

export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;

  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 50);
  const result = await MessageDeliveryService.processRetryQueue(limit);
  return NextResponse.json({ ok: true, result, timestamp: new Date().toISOString() });
}

export async function POST(req: Request) {
  return GET(req);
}
