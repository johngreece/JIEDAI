import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { ACTIVE_LOAN_STATUSES } from "@/lib/business-status";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { requirePermission } from "@/lib/rbac";
import {
  getClientBaseCreditLimit,
  getClientProfileCompletion,
  resolveProfileCompletedAt,
} from "@/lib/client-profile";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  idNumber: z.string().min(1).optional(),
  taxNumber: z.string().nullable().optional(),
  passportNumber: z.string().nullable().optional(),
  residencePermitNumber: z.string().nullable().optional(),
  residencePermitExpiry: z.string().nullable().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  emergencyContact: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactRelation: z.string().optional(),
  bankAccount: z.string().optional(),
  bankName: z.string().optional(),
  riskLevel: z.enum(["LOW", "NORMAL", "HIGH", "BLACKLIST"]).optional(),
  weeklyInterestRateOverride: z.number().min(0).max(100).nullable().optional(),
  pricingRemark: z.string().max(500).nullable().optional(),
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
  const profileCompletion = getClientProfileCompletion(customer);
  return NextResponse.json({
    ...rest,
    profileComplete: profileCompletion.profileComplete,
    profileCompletedAt: profileCompletion.profileComplete
      ? customer.profileCompletedAt
      : null,
    weeklyInterestRateOverride: customer.weeklyInterestRateOverride != null ? Number(customer.weeklyInterestRateOverride) : null,
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

  if (parsed.data.idNumber && parsed.data.idNumber !== existing.idNumber) {
    const dup = await prisma.customer.findFirst({
      where: { idNumber: parsed.data.idNumber, deletedAt: null, id: { not: id } },
    });
    if (dup) return NextResponse.json({ error: "身份证号已被使用" }, { status: 409 });
  }

  const { newPassword, ...updateData } = parsed.data;
  const dataToWrite: Record<string, unknown> = { ...updateData };
  if (typeof dataToWrite.residencePermitExpiry === "string") {
    const value = dataToWrite.residencePermitExpiry.trim();
    if (value) {
      const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime())) {
        return NextResponse.json({ error: "居留有效期格式不正确" }, { status: 400 });
      }
      dataToWrite.residencePermitExpiry = date;
    } else {
      dataToWrite.residencePermitExpiry = null;
    }
  }
  if (newPassword) {
    dataToWrite.passwordHash = await hashPassword(newPassword);
  }

  const updated = await prisma.customer.update({
    where: { id },
    data: dataToWrite,
    include: {
      kyc: {
        select: {
          kycType: true,
          documentUrl: true,
          status: true,
          expiresAt: true,
        },
      },
    },
  });

  const completion = getClientProfileCompletion(updated);
  const profileCompletedAt = resolveProfileCompletedAt(updated, completion.profileComplete);
  const updatedWithProfileStatus = await prisma.customer.update({
    where: { id },
    data: {
      profileCompletedAt,
      creditLimit: getClientBaseCreditLimit(completion),
    },
  });
  const finalCustomer = {
    ...updated,
    profileCompletedAt: updatedWithProfileStatus.profileCompletedAt,
    creditLimit: updatedWithProfileStatus.creditLimit,
  };

  await writeAuditLog({
    userId: session.sub,
    action: "update",
    entityType: "customer",
    entityId: id,
    oldValue: {
      name: existing.name,
      phone: existing.phone,
      idNumber: existing.idNumber,
      taxNumber: existing.taxNumber,
      passportNumber: existing.passportNumber,
      residencePermitNumber: existing.residencePermitNumber,
      residencePermitExpiry: existing.residencePermitExpiry,
      email: existing.email,
      address: existing.address,
      emergencyContact: existing.emergencyContact,
      emergencyContactPhone: existing.emergencyContactPhone,
      emergencyContactRelation: existing.emergencyContactRelation,
      bankAccount: existing.bankAccount,
      bankName: existing.bankName,
      riskLevel: existing.riskLevel,
      weeklyInterestRateOverride: existing.weeklyInterestRateOverride != null ? Number(existing.weeklyInterestRateOverride) : null,
      pricingRemark: existing.pricingRemark,
      remark: existing.remark,
    },
    newValue: {
      name: updated.name,
      phone: updated.phone,
      idNumber: updated.idNumber,
      taxNumber: updated.taxNumber,
      passportNumber: updated.passportNumber,
      residencePermitNumber: updated.residencePermitNumber,
      residencePermitExpiry: updated.residencePermitExpiry,
      profileCompletedAt: finalCustomer.profileCompletedAt,
      email: updated.email,
      address: updated.address,
      emergencyContact: updated.emergencyContact,
      emergencyContactPhone: updated.emergencyContactPhone,
      emergencyContactRelation: updated.emergencyContactRelation,
      bankAccount: updated.bankAccount,
      bankName: updated.bankName,
      riskLevel: updated.riskLevel,
      weeklyInterestRateOverride: updated.weeklyInterestRateOverride != null ? Number(updated.weeklyInterestRateOverride) : null,
      pricingRemark: updated.pricingRemark,
      remark: updated.remark,
      passwordUpdated: Boolean(newPassword),
    },
    changeSummary: "编辑客户资料",
    ipAddress: req.headers.get("x-forwarded-for") || null,
    userAgent: req.headers.get("user-agent") || null,
  }).catch(() => undefined);

  const { passwordHash, ...rest } = finalCustomer;
  return NextResponse.json({
    ...rest,
    weeklyInterestRateOverride: finalCustomer.weeklyInterestRateOverride != null ? Number(finalCustomer.weeklyInterestRateOverride) : null,
  });
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
      status: { in: [...ACTIVE_LOAN_STATUSES] },
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
