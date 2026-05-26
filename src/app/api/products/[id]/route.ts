import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { ACTIVE_LOAN_STATUSES } from "@/lib/business-status";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

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
  const session = await requirePermission(["settings:view"]);
  if (session instanceof Response) return session;

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
  const session = await requirePermission(["settings:edit"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.loanProduct.findFirst({ where: { id, deletedAt: null } });
  if (!existing) return NextResponse.json({ error: "产品不存在" }, { status: 404 });

  const product = await prisma.loanProduct.update({ where: { id }, data: parsed.data });

  await writeAuditLog({
    userId: session.sub,
    action: "update",
    entityType: "loan_product",
    entityId: id,
    oldValue: {
      name: existing.name,
      minAmount: Number(existing.minAmount),
      maxAmount: Number(existing.maxAmount),
      isActive: existing.isActive,
    },
    newValue: {
      name: product.name,
      minAmount: Number(product.minAmount),
      maxAmount: Number(product.maxAmount),
      isActive: product.isActive,
    },
    changeSummary: "Update loan product",
  }).catch((error) => console.error("[AuditLog] product-update", error));

  return NextResponse.json({ ...product, minAmount: Number(product.minAmount), maxAmount: Number(product.maxAmount) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission(["settings:edit"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const existing = await prisma.loanProduct.findFirst({ where: { id, deletedAt: null } });
  if (!existing) return NextResponse.json({ error: "产品不存在" }, { status: 404 });

  const activeApplicationCount = await prisma.loanApplication.count({
    where: {
      productId: id,
      deletedAt: null,
      status: { in: [...ACTIVE_LOAN_STATUSES] },
    },
  });
  if (activeApplicationCount > 0) {
    return NextResponse.json(
      { error: "产品仍有关联的在途借款申请，不能删除", activeApplicationCount },
      { status: 409 },
    );
  }

  await prisma.loanProduct.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });

  await writeAuditLog({
    userId: session.sub,
    action: "delete",
    entityType: "loan_product",
    entityId: id,
    oldValue: {
      name: existing.name,
      code: existing.code,
      isActive: existing.isActive,
    },
    newValue: { deletedAt: true, isActive: false },
    changeSummary: "Soft-delete loan product",
  }).catch((error) => console.error("[AuditLog] product-delete", error));

  return NextResponse.json({ ok: true });
}
