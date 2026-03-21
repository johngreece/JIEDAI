import { NextResponse } from "next/server";
import { ClientNotificationService } from "@/services/client-notification.service";
import { FunderNotificationService } from "@/services/funder-notification.service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [clientResult, funderResult] = await Promise.all([
      ClientNotificationService.scanAll(),
      FunderNotificationService.scanInterestMaturity(),
    ]);

    return NextResponse.json({
      success: true,
      client: clientResult,
      funder: funderResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Notification scan failed",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 }
    );
  }
}
