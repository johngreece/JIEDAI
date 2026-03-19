import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createFunderToken, setFunderCookie } from "@/lib/auth";
import { verifyPassword, isBcryptHash, hashPassword } from "@/lib/password";
import { loginLimiter, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = loginLimiter.check(`funder:${ip}`);
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const body = await req.json().catch(() => ({}));
  const { phone, password } = body;
  if (!phone || !password) {
    return NextResponse.json({ error: "手机号和密码必填" }, { status: 400 });
  }

  const funder = await prisma.funder.findFirst({
    where: { loginPhone: phone, deletedAt: null, isActive: true },
  });
  if (!funder || !funder.passwordHash) {
    return NextResponse.json({ error: "手机号或密码错误" }, { status: 401 });
  }

  const valid = await verifyPassword(password, funder.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "手机号或密码错误" }, { status: 401 });
  }

  if (!isBcryptHash(funder.passwordHash)) {
    const hashed = await hashPassword(password);
    await prisma.funder.update({ where: { id: funder.id }, data: { passwordHash: hashed } });
  }

  const token = await createFunderToken({
    sub: funder.id,
    name: funder.name,
    phone: funder.loginPhone!,
  });

  const cookieStore = await cookies();
  cookieStore.set(setFunderCookie(token));
  return NextResponse.json({ ok: true });
}
