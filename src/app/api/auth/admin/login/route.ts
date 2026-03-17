import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAdminToken, setAdminCookie } from "@/lib/auth";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { username, password } = body;
  if (!username || !password) {
    return NextResponse.json({ error: "用户名和密码必填" }, { status: 400 });
  }
  const user = await prisma.user.findFirst({
    where: { username, deletedAt: null, isActive: true },
    include: { role: true },
  });
  if (!user) {
    return NextResponse.json({ error: "用户不存在或已禁用" }, { status: 401 });
  }
  // TODO: 正式环境应使用 bcrypt 校验
  if (user.passwordHash !== password) {
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }
  const token = await createAdminToken({
    sub: user.id,
    username: user.username,
    roles: [user.role.code],
  });
  const cookieStore = await cookies();
  cookieStore.set(setAdminCookie(token));
  return NextResponse.json({ ok: true });
}
