import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  emergencyContact: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactRelation: z.string().optional(),
  bankAccount: z.string().optional(),
  bankName: z.string().optional(),
  riskLevel: z.enum(["LOW", "NORMAL", "HIGH", "BLACKLIST"]).optional(),
  remark: z.string().optional(),
  newPassword: z.string().min(6).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["customer:view"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const customer = await prisma.customer.findFirst({
    where: { id, deletedAt: null },
    include: {
      kyc: true,
      loanApplications: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          applicationNo: true,
          amount: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });

  if (!customer) {
    return NextResponse.json({ error: "客户不存在" }, { status: 404 });
  }

  const { passwordHash, ...rest } = customer;
  return NextResponse.json({
    ...rest,
    loanApplications: rest.loanApplications.map((a) => ({
      ...a,
      amount: Number(a.amount),
    })),
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["customer:edit"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数错误", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const existing = await prisma.customer.findFirst({ where: { id, deletedAt: null } });
  if (!existing) {
    return NextResponse.json({ error: "客户不存在" }, { status: 404 });
  }

  if (parsed.data.phone && parsed.data.phone !== existing.phone) {
    const dup = await prisma.customer.findFirst({
      where: { phone: parsed.data.phone, deletedAt: null, id: { not: id } },
    });
    if (dup) return NextResponse.json({ error: "手机号已被使用" }, { status: 409 });
  }

  const { newPassword, ...updateData } = parsed.data;
  const dataToWrite: Record<string, unknown> = { ...updateData };
  if (newPassword) {
    dataToWrite.passwordHash = await hashPassword(newPassword);
  }

  const updated = await prisma.customer.update({
    where: { id },
    data: dataToWrite,
  });

  await writeAuditLog({
    userId: session.sub,
    action: "update",
    entityType: "customer",
    entityId: id,
    oldValue: {
      name: existing.name,
      phone: existing.phone,
      email: existing.email,
      address: existing.address,
      emergencyContact: existing.emergencyContact,
      emergencyContactPhone: existing.emergencyContactPhone,
      emergencyContactRelation: existing.emergencyContactRelation,
      bankAccount: existing.bankAccount,
      bankName: existing.bankName,
      riskLevel: existing.riskLevel,
      remark: existing.remark,
    },
    newValue: {
      name: updated.name,
      phone: updated.phone,
      email: updated.email,
      address: updated.address,
      emergencyContact: updated.emergencyContact,
      emergencyContactPhone: updated.emergencyContactPhone,
      emergencyContactRelation: updated.emergencyContactRelation,
      bankAccount: updated.bankAccount,
      bankName: updated.bankName,
      riskLevel: updated.riskLevel,
      remark: updated.remark,
      passwordUpdated: Boolean(newPassword),
    },
    changeSummary: "编辑客户资料",
    ipAddress: req.headers.get("x-forwarded-for") || null,
    userAgent: req.headers.get("user-agent") || null,
  }).catch(() => undefined);

  const { passwordHash, ...rest } = updated;
  return NextResponse.json(rest);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["customer:edit"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const existing = await prisma.customer.findFirst({ where: { id, deletedAt: null } });
  if (!existing) {
    return NextResponse.json({ error: "客户不存在" }, { status: 404 });
  }

  const activeLoan = await prisma.loanApplication.findFirst({
    where: {
      customerId: id,
      status: { in: ["PENDING", "APPROVED", "DISBURSED"] },
      deletedAt: null,
    },
  });
  if (activeLoan) {
    return NextResponse.json({ error: "客户仍有进行中的借款，无法删除" }, { status: 409 });
  }

  await prisma.customer.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
