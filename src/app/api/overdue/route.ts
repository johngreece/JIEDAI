import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getOverdueList } from "@/services/overdue.service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));

  const result = await getOverdueList({ status, page, pageSize });
  return NextResponse.json(result);
}
