import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const bodySchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  idNumber: z.string().min(1, "请填写证件号"),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  password: z.string().optional(),
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

  const customer = await prisma.customer.create({
    data: {
      name: data.name,
      phone: data.phone,
      idNumber: data.idNumber,
      email: data.email || null,
      address: data.address ?? null,
      passwordHash: data.password ?? null,
    },
  });

  return NextResponse.json({ id: customer.id });
}
