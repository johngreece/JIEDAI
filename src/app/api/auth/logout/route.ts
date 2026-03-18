import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST() {
  const cookieStore = await cookies();

  // 删除 admin 和 client 两种 session cookie
  cookieStore.set("admin_session", "", { maxAge: 0, path: "/" });
  cookieStore.set("client_session", "", { maxAge: 0, path: "/" });

  return NextResponse.json({ ok: true });
}
