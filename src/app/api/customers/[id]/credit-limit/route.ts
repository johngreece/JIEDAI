import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* GET — 获取客户额度信息 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      creditLimit: true,
      creditLimitOverride: true,
      kyc: { select: { kycType: true, status: true, documentUrl: true, createdAt: true } },
    },
  });

  if (!customer) {
    return NextResponse.json({ error: "客户不存在" }, { status: 404 });
  }

  const VALID_DOC_TYPES = ["PASSPORT", "CHINA_ID", "GREEK_RESIDENCE_PERMIT"];
  const uploadedTypes = new Set(customer.kyc.map((d) => d.kycType));
  const allUploaded = VALID_DOC_TYPES.every((t) => uploadedTypes.has(t));
  const baseLimit = allUploaded ? 30000 : 10000;
  const effectiveLimit = customer.creditLimitOverride
    ? Number(customer.creditLimitOverride)
    : baseLimit;

  return NextResponse.json({
    id: customer.id,
    name: customer.name,
    creditLimit: Number(customer.creditLimit),
    creditLimitOverride: customer.creditLimitOverride ? Number(customer.creditLimitOverride) : null,
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
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  return NextResponse.json({
    id: customer.id,
    name: customer.name,
    creditLimit: Number(customer.creditLimit),
    creditLimitOverride: customer.creditLimitOverride ? Number(customer.creditLimitOverride) : null,
  });
}
