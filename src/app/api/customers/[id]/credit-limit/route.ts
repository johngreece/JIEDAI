import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { getClientProfileCompletion } from "@/lib/client-profile";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/* GET — 获取客户额度信息 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["customer:view"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const customer = await prisma.customer.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      phone: true,
      address: true,
      taxNumber: true,
      idNumber: true,
      passportNumber: true,
      residencePermitNumber: true,
      residencePermitExpiry: true,
      creditLimit: true,
      creditLimitOverride: true,
      kyc: { select: { kycType: true, status: true, documentUrl: true, expiresAt: true, createdAt: true } },
    },
  });

  if (!customer) {
    return NextResponse.json({ error: "客户不存在" }, { status: 404 });
  }

  const completion = getClientProfileCompletion(customer);
  const allUploaded = completion.documentsComplete;
  const baseLimit = allUploaded ? 30000 : 10000;
  const effectiveLimit = customer.creditLimitOverride != null
    ? Number(customer.creditLimitOverride)
    : baseLimit;

  return NextResponse.json({
    id: customer.id,
    name: customer.name,
    creditLimit: Number(customer.creditLimit),
    creditLimitOverride: customer.creditLimitOverride != null ? Number(customer.creditLimitOverride) : null,
    effectiveLimit,
    baseLimit,
    allDocumentsUploaded: allUploaded,
    documents: customer.kyc.map((d) => ({
      kycType: d.kycType,
      status: d.status,
      hasDocument: !!d.documentUrl,
      createdAt: d.createdAt,
    })),
  });
}

/* PATCH — 管理员设置客户特定额度 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["customer:edit"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const body = await req.json();
  const { creditLimitOverride } = body;

  // Allow null to clear override, or a positive number
  if (creditLimitOverride !== null && creditLimitOverride !== undefined) {
    const num = Number(creditLimitOverride);
    if (isNaN(num) || num < 0) {
      return NextResponse.json({ error: "额度必须为正数" }, { status: 400 });
    }
  }

  const existing = await prisma.customer.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true, creditLimitOverride: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "客户不存在" }, { status: 404 });
  }

  const customer = await prisma.customer.update({
    where: { id },
    data: {
      creditLimitOverride: creditLimitOverride === null ? null : Number(creditLimitOverride),
    },
    select: {
      id: true,
      name: true,
      creditLimit: true,
      creditLimitOverride: true,
    },
  });

  await writeAuditLog({
    userId: session.sub,
    action: "update",
    entityType: "customer",
    entityId: id,
    oldValue: {
      creditLimitOverride: existing.creditLimitOverride != null ? Number(existing.creditLimitOverride) : null,
    },
    newValue: {
      creditLimitOverride: customer.creditLimitOverride != null ? Number(customer.creditLimitOverride) : null,
    },
    changeSummary: "Update customer credit limit override",
  }).catch((error) => console.error("[AuditLog] customer-credit-limit", error));

  return NextResponse.json({
    id: customer.id,
    name: customer.name,
    creditLimit: Number(customer.creditLimit),
    creditLimitOverride: customer.creditLimitOverride != null ? Number(customer.creditLimitOverride) : null,
  });
}
