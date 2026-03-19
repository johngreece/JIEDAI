import { NextRequest, NextResponse } from "next/server";
import { getSession, isClient } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VALID_DOC_TYPES = ["PASSPORT", "CHINA_ID", "GREEK_RESIDENCE_PERMIT"] as const;
const DOC_TYPE_LABELS: Record<string, string> = {
  PASSPORT: "护照",
  CHINA_ID: "国内身份证",
  GREEK_RESIDENCE_PERMIT: "希腊居留卡",
};
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/* GET — 获取当前客户的所有证件 */
export async function GET() {
  const session = await getSession();
  if (!session || !isClient(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const docs = await prisma.customerKyc.findMany({
    where: { customerId: session.sub },
    orderBy: { createdAt: "desc" },
  });

  // Calculate credit limit
  const customer = await prisma.customer.findUnique({
    where: { id: session.sub },
    select: { creditLimit: true, creditLimitOverride: true },
  });

  const uploadedTypes = new Set(docs.map((d) => d.kycType));
  const allUploaded = VALID_DOC_TYPES.every((t) => uploadedTypes.has(t));
  const baseLimit = 10000;
  const maxLimit = allUploaded ? 30000 : baseLimit;
  const effectiveLimit = customer?.creditLimitOverride
    ? Number(customer.creditLimitOverride)
    : maxLimit;

  return NextResponse.json({
    documents: docs.map((d) => ({
      id: d.id,
      kycType: d.kycType,
      label: DOC_TYPE_LABELS[d.kycType] || d.kycType,
      documentUrl: d.documentUrl,
      status: d.status,
      createdAt: d.createdAt,
    })),
    creditLimit: effectiveLimit,
    allDocumentsUploaded: allUploaded,
    docTypes: VALID_DOC_TYPES.map((t) => ({
      type: t,
      label: DOC_TYPE_LABELS[t],
      uploaded: uploadedTypes.has(t),
    })),
  });
}

/* POST — 上传或更新证件 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !isClient(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const kycType = formData.get("kycType") as string;
  const file = formData.get("file") as File | null;

  if (!kycType || !VALID_DOC_TYPES.includes(kycType as typeof VALID_DOC_TYPES[number])) {
    return NextResponse.json(
      { error: `无效证件类型，支持: ${VALID_DOC_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  if (!file) {
    return NextResponse.json({ error: "请上传文件" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "文件大小不能超过5MB" }, { status: 400 });
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: "仅支持 JPG/PNG/WebP/PDF 格式" },
      { status: 400 }
    );
  }

  // Convert file to base64 data URL for storage
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const dataUrl = `data:${file.type};base64,${base64}`;

  // Upsert: one document per type per customer
  const doc = await prisma.customerKyc.upsert({
    where: {
      customerId_kycType: {
        customerId: session.sub,
        kycType,
      },
    },
    create: {
      customerId: session.sub,
      kycType,
      documentUrl: dataUrl,
      status: "UPLOADED",
    },
    update: {
      documentUrl: dataUrl,
      status: "UPLOADED",
      verifiedAt: null,
    },
  });

  // Recalculate credit limit after upload
  const allDocs = await prisma.customerKyc.findMany({
    where: { customerId: session.sub },
    select: { kycType: true },
  });
  const uploadedTypes = new Set(allDocs.map((d) => d.kycType));
  const allUploaded = VALID_DOC_TYPES.every((t) => uploadedTypes.has(t));

  // Update base credit limit if all docs uploaded
  if (allUploaded) {
    await prisma.customer.update({
      where: { id: session.sub },
      data: { creditLimit: 30000 },
    });
  }

  return NextResponse.json({
    id: doc.id,
    kycType: doc.kycType,
    label: DOC_TYPE_LABELS[kycType] || kycType,
    status: doc.status,
    allDocumentsUploaded: allUploaded,
    creditLimit: allUploaded ? 30000 : 10000,
  });
}
