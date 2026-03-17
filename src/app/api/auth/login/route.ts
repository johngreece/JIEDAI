import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createToken } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { username, password } = body;
  if (!username || !password) {
    return NextResponse.json(
      { error: "用户名和密码必填" },
      { status: 400 }
    );
  }
  const user = await prisma.user.findFirst({
    where: { username, deletedAt: null, isActive: true },
    include: {
      userRoles: { include: { role: true } },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "用户不存在或已禁用" }, { status: 401 });
  }
  // 占位：实际应使用 bcrypt 校验 passwordHash
  if (user.passwordHash !== password) {
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }
  const roles = user.userRoles.map((ur) => ur.role.code);
  const token = await createToken({
    sub: user.id,
    username: user.username,
    roles,
    scope: user.userRoles[0]?.scopeJson as Record<string, unknown> | undefined,
  });
  const cookieStore = await cookies();
  cookieStore.set("loan_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return NextResponse.json({ ok: true });
}
