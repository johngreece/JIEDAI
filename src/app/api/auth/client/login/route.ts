import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClientToken, setClientCookie } from "@/lib/auth";
import { verifyPassword, isBcryptHash, hashPassword } from "@/lib/password";
import { loginLimiter, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // 限流检查
  const ip = getClientIp(req);
  const rl = loginLimiter.check(`client:${ip}`);
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const body = await req.json().catch(() => ({}));
  const { phone, password } = body;
  if (!phone || !password) {
    return NextResponse.json({ error: "手机号和密码必填" }, { status: 400 });
  }
  const customer = await prisma.customer.findFirst({
    where: { phone, deletedAt: null },
  });
  if (!customer) {
    return NextResponse.json({ error: "手机号或密码错误" }, { status: 401 });
  }
  if (!customer.passwordHash) {
    return NextResponse.json({ error: "账户未设置密码，请联系管理员" }, { status: 401 });
  }
  const valid = await verifyPassword(password, customer.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "手机号或密码错误" }, { status: 401 });
  }
  // 自动升级旧明文密码为 bcrypt 哈希
  if (!isBcryptHash(customer.passwordHash)) {
    const hashed = await hashPassword(password);
    await prisma.customer.update({ where: { id: customer.id }, data: { passwordHash: hashed } });
  }
  const token = await createClientToken({
    sub: customer.id,
    name: customer.name,
    phone: customer.phone,
  });
  const cookieStore = await cookies();
  cookieStore.set(setClientCookie(token));
  return NextResponse.json({ ok: true });
}
