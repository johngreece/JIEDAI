import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const bodySchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  idType: z.string().optional(),
  idNumber: z.string().optional(),
  passportNumber: z.string().min(1, "请填写护照号"),
  passportExpiry: z.string().optional(),
  passportCountry: z.string().optional(),
  residenceType: z.string().optional(),
  residenceNumber: z.string().min(1, "请填写居留证件号"),
  residenceExpiry: z.string().optional(),
  address: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
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
  const passportExpiry = data.passportExpiry ? new Date(data.passportExpiry) : null;
  const residenceExpiry = data.residenceExpiry ? new Date(data.residenceExpiry) : null;

  const customerNo =
    "C" +
    Date.now().toString(36).toUpperCase() +
    Math.random().toString(36).slice(2, 6).toUpperCase();

  const customer = await prisma.customer.create({
    data: {
      customerNo,
      name: data.name,
      phone: data.phone ?? null,
      email: data.email || null,
      idType: data.idType ?? null,
      idNumber: data.idNumber ?? null,
      passportNumber: data.passportNumber,
      passportExpiry,
      passportCountry: data.passportCountry ?? null,
      residenceType: data.residenceType ?? null,
      residenceNumber: data.residenceNumber,
      residenceExpiry,
      address: data.address ?? null,
      createdById: session.sub,
    },
  });

  return NextResponse.json({ id: customer.id, customerNo: customer.customerNo });
}
