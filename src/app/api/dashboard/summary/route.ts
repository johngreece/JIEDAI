import { NextResponse } from "next/server";
import { DashboardService } from "@/services/dashboard.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await DashboardService.getSummary();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Dashboard summary error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard summary" }, { status: 500 });
  }
}
