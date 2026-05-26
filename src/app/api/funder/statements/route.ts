import { NextRequest, NextResponse } from "next/server";
import { getFunderSession } from "@/lib/auth";
import { ensureActiveFunderSession } from "@/lib/portal-session";
import { requirePermission } from "@/lib/rbac";
import { FunderStatementService } from "@/services/funder-statement.service";

export const dynamic = "force-dynamic";

function parseDateBoundary(value: string, boundary: "start" | "end") {
  const rawValue = value.trim();
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(rawValue);
  const date = new Date(isDateOnly ? `${rawValue}T00:00:00` : rawValue);
  if (Number.isNaN(date.getTime())) return null;

  if (isDateOnly) {
    if (boundary === "start") {
      date.setHours(0, 0, 0, 0);
    } else {
      date.setHours(23, 59, 59, 999);
    }
  }

  return date;
}

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
    const activeFunderSession = await ensureActiveFunderSession(funderSession);
    if (activeFunderSession instanceof Response) return activeFunderSession;

    funderId = activeFunderSession.sub;
  } else {
    const adminSession = await requirePermission(["ledger:view"]);
    if (adminSession instanceof Response) return adminSession;
    if (!queryFunderId) return NextResponse.json({ error: "请提供 funderId" }, { status: 400 });
    funderId = queryFunderId;
  }

  if (!startStr || !endStr) {
    return NextResponse.json({ error: "请提供 start 和 end 日期参数" }, { status: 400 });
  }

  const startDate = parseDateBoundary(startStr, "start");
  const endDate = parseDateBoundary(endStr, "end");
  if (!startDate || !endDate) {
    return NextResponse.json({ error: "日期格式无效" }, { status: 400 });
  }
  if (startDate > endDate) {
    return NextResponse.json({ error: "开始日期不能晚于结束日期" }, { status: 400 });
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
