import { NextResponse } from "next/server";
import { getLedgerList, ledgerListToCSV } from "@/services/ledger.service";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requirePermission(["ledger:view"]);
  if (session instanceof Response) return session;

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? undefined;
  const direction = url.searchParams.get("direction") ?? undefined;
  const movement = url.searchParams.get("movement") ?? undefined;
  const scope = url.searchParams.get("scope") ?? undefined;
  const startDate = url.searchParams.get("startDate") ?? url.searchParams.get("start") ?? undefined;
  const endDate = url.searchParams.get("endDate") ?? url.searchParams.get("end") ?? undefined;
  const format = url.searchParams.get("format") ?? "json";
  const isCsv = format === "csv";
  const page = isCsv ? 1 : Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const defaultPageSize = isCsv ? 5000 : 20;
  const maxPageSize = isCsv ? 5000 : 100;
  const pageSize = Math.min(maxPageSize, Math.max(1, Number(url.searchParams.get("pageSize") ?? defaultPageSize)));

  const result = await getLedgerList({ type, direction, movement, scope, startDate, endDate, page, pageSize });

  if (isCsv) {
    const csv = ledgerListToCSV(result);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ledger_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return NextResponse.json(result);
}
