import { NextResponse } from "next/server";
import { getSmartDashboardData } from "@/lib/dashboard-data";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requirePermission(["dashboard:view"]);
  if (session instanceof Response) return session;

  try {
    const data = await getSmartDashboardData();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Smart dashboard error:", error);
    return NextResponse.json(
      { error: "获取智能分析数据失败" },
      { status: 500 }
    );
  }
}
