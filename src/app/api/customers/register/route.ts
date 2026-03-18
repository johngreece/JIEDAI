import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  idNumber: z.string().min(1, "请填写证件号"),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  password: z.string().min(6, "密码至少 6 位").optional(),
});

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数错误", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const data = parsed.data;

  // 检查手机号/证件号唯一性
  const existing = await prisma.customer.findFirst({
    where: {
      OR: [{ phone: data.phone }, { idNumber: data.idNumber }],
      deletedAt: null,
    },
  });
  if (existing) {
    const field = existing.phone === data.phone ? "手机号" : "证件号";
    return NextResponse.json({ error: `该${field}已注册` }, { status: 409 });
  }

  const hashedPwd = data.password ? await hashPassword(data.password) : null;

  const customer = await prisma.customer.create({
    data: {
      name: data.name,
      phone: data.phone,
      idNumber: data.idNumber,
      email: data.email || null,
      address: data.address ?? null,
      passwordHash: hashedPwd,
    },
  });

  return NextResponse.json({ id: customer.id });
}
