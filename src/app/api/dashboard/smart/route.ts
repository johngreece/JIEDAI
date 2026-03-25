import { NextResponse } from "next/server";
import { getSmartDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export async function GET() {
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
