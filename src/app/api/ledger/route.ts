import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getLedgerList } from "@/services/ledger.service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? undefined;
  const direction = url.searchParams.get("direction") ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));

  const result = await getLedgerList({ type, direction, page, pageSize });
  return NextResponse.json(result);
}
