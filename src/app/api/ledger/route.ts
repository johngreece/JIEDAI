import { NextResponse } from "next/server";
import { getLedgerList } from "@/services/ledger.service";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requirePermission(["ledger:view"]);
  if (session instanceof Response) return session;

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? undefined;
  const direction = url.searchParams.get("direction") ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));

  const result = await getLedgerList({ type, direction, page, pageSize });
  return NextResponse.json(result);
}
