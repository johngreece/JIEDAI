import { NextRequest, NextResponse } from "next/server";
import { getFunderSession, getAdminSession } from "@/lib/auth";
import { FunderStatementService } from "@/services/funder-statement.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/funder/statements?start=2026-01-01&end=2026-03-31&format=json|csv
 * 资金方对账单导出（资金方端 或 管理端用 funderId 参数）
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const startStr = url.searchParams.get("start");
  const endStr = url.searchParams.get("end");
  const format = url.searchParams.get("format") ?? "json";
  const queryFunderId = url.searchParams.get("funderId");

  // Auth: funder self or admin
  let funderId: string;
  const funderSession = await getFunderSession();
  if (funderSession) {
    funderId = funderSession.sub;
  } else {
    const adminSession = await getAdminSession();
    if (!adminSession || !queryFunderId) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    funderId = queryFunderId;
  }

  if (!startStr || !endStr) {
    return NextResponse.json({ error: "请提供 start 和 end 日期参数" }, { status: 400 });
  }

  const startDate = new Date(startStr);
  const endDate = new Date(endStr);
  endDate.setHours(23, 59, 59, 999);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json({ error: "日期格式无效" }, { status: 400 });
  }

  const statement = await FunderStatementService.generate(funderId, startDate, endDate);

  if (format === "csv") {
    const csv = FunderStatementService.toCSV(statement);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="statement_${statement.periodStart}_${statement.periodEnd}.csv"`,
      },
    });
  }

  return NextResponse.json(statement);
}
