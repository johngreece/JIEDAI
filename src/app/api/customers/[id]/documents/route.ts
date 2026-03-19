/**
 * GET  /api/customers/:id/documents       — 获取客户所有证件
 * POST /api/customers/:id/documents       — 管理员为客户上传证件
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VALID_DOC_TYPES = ["PASSPORT", "CHINA_ID", "GREEK_RESIDENCE_PERMIT"] as const;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/* GET — 获取客户全部证件（含文件内容） */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });
  }

  const { id } = await params;

  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!customer) {
    return NextResponse.json({ error: "客户不存在" }, { status: 404 });
  }

  const docs = await prisma.customerKyc.findMany({
    where: { customerId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    documents: docs.map((d) => ({
      id: d.id,
      kycType: d.kycType,
      documentUrl: d.documentUrl,
      status: d.status,
      verifiedAt: d.verifiedAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
    })),
  });
}

/* POST — 管理员上传证件 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });
  }

  const { id } = await params;

  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!customer) {
    return NextResponse.json({ error: "客户不存在" }, { status: 404 });
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

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const dataUrl = `data:${file.type};base64,${base64}`;

  const doc = await prisma.customerKyc.upsert({
    where: {
      customerId_kycType: { customerId: id, kycType },
    },
    create: {
      customerId: id,
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

  // 重算额度
  const allDocs = await prisma.customerKyc.findMany({
    where: { customerId: id },
    select: { kycType: true },
  });
  const uploadedTypes = new Set(allDocs.map((d) => d.kycType));
  const allUploaded = VALID_DOC_TYPES.every((t) => uploadedTypes.has(t));

  if (allUploaded) {
    await prisma.customer.update({
      where: { id },
      data: { creditLimit: 30000 },
    });
  }

  return NextResponse.json({
    id: doc.id,
    kycType: doc.kycType,
    status: doc.status,
    allDocumentsUploaded: allUploaded,
  });
}
