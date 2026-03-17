import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClientToken, setClientCookie } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { phone, password } = body;
  if (!phone || !password) {
    return NextResponse.json({ error: "手机号和密码必填" }, { status: 400 });
  }
  const customer = await prisma.customer.findFirst({
    where: { phone, deletedAt: null },
  });
  if (!customer) {
    return NextResponse.json({ error: "客户不存在" }, { status: 401 });
  }
  if (!customer.passwordHash) {
    return NextResponse.json({ error: "账户未设置密码，请联系管理员" }, { status: 401 });
  }
  // TODO: 正式环境应使用 bcrypt 校验
  if (customer.passwordHash !== password) {
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
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
