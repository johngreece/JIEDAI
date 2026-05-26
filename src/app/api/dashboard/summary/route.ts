import { NextResponse } from "next/server";
import { getDashboardSummaryData } from "@/lib/dashboard-data";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requirePermission(["dashboard:view"]);
  if (session instanceof Response) return session;

  try {
    const data = await getDashboardSummaryData();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Dashboard summary error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard summary" }, { status: 500 });
  }
}
