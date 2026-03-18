import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAdminToken, setAdminCookie } from "@/lib/auth";
import { verifyPassword, isBcryptHash, hashPassword } from "@/lib/password";
import { loginLimiter, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // 限流检查
  const ip = getClientIp(req);
  const rl = loginLimiter.check(`admin:${ip}`);
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

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
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }
  // 自动升级旧明文密码为 bcrypt 哈希
  if (!isBcryptHash(user.passwordHash)) {
    const hashed = await hashPassword(password);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashed } });
  }
  // 记录登录时间和 IP
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), lastLoginIp: req.headers.get("x-forwarded-for") ?? req.ip ?? null },
  });
  const token = await createAdminToken({
    sub: user.id,
    username: user.username,
    roles: [user.role.code],
  });
  const cookieStore = await cookies();
  cookieStore.set(setAdminCookie(token));
  return NextResponse.json({ ok: true });
}
