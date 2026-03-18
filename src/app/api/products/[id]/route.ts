import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  minAmount: z.number().positive().optional(),
  maxAmount: z.number().positive().optional(),
  minTermValue: z.number().int().positive().optional(),
  maxTermValue: z.number().int().positive().optional(),
  termUnit: z.enum(["DAY", "MONTH"]).optional(),
  repaymentMethod: z.enum(["ONE_TIME", "EQUAL_INSTALLMENT", "EQUAL_PRINCIPAL"]).optional(),
  allowEarlyRepay: z.boolean().optional(),
  allowExtension: z.boolean().optional(),
  maxExtensionTimes: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const { id } = await params;
  const product = await prisma.loanProduct.findFirst({
    where: { id, deletedAt: null },
    include: { pricingRules: { where: { isActive: true }, orderBy: { priority: "desc" } } },
  });

  if (!product) return NextResponse.json({ error: "产品不存在" }, { status: 404 });

  return NextResponse.json({
    ...product,
    minAmount: Number(product.minAmount),
    maxAmount: Number(product.maxAmount),
    pricingRules: product.pricingRules.map((r) => ({
      ...r,
      rateValue: Number(r.rateValue),
      minValue: r.minValue ? Number(r.minValue) : null,
      maxValue: r.maxValue ? Number(r.maxValue) : null,
    })),
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.loanProduct.findFirst({ where: { id, deletedAt: null } });
  if (!existing) return NextResponse.json({ error: "产品不存在" }, { status: 404 });

  const product = await prisma.loanProduct.update({ where: { id }, data: parsed.data });

  return NextResponse.json({ ...product, minAmount: Number(product.minAmount), maxAmount: Number(product.maxAmount) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const { id } = await params;
  await prisma.loanProduct.update({ where: { id }, data: { deletedAt: new Date() } });

  return NextResponse.json({ ok: true });
}
