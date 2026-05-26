import { NextRequest, NextResponse } from "next/server";
import {
  REQUIRED_CLIENT_DOCUMENT_TYPES,
  getClientProfileCompletion,
  resolveProfileCompletedAt,
} from "@/lib/client-profile";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const customerProfileSelect = {
  id: true,
  phone: true,
  address: true,
  taxNumber: true,
  idNumber: true,
  passportNumber: true,
  residencePermitNumber: true,
  residencePermitExpiry: true,
  profileCompletedAt: true,
  kyc: {
    select: {
      kycType: true,
      documentUrl: true,
      status: true,
      expiresAt: true,
    },
  },
} as const;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["customer:view"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const customer = await prisma.customer.findFirst({
    where: { id, deletedAt: null },
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
    documents: docs.map((document) => ({
      id: document.id,
      kycType: document.kycType,
      documentUrl: document.documentUrl,
      status: document.status,
      verifiedAt: document.verifiedAt?.toISOString() ?? null,
      createdAt: document.createdAt.toISOString(),
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["customer:edit"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const customer = await prisma.customer.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!customer) {
    return NextResponse.json({ error: "客户不存在" }, { status: 404 });
  }

  const formData = await req.formData();
  const kycType = String(formData.get("kycType") ?? "");
  const file = formData.get("file") as File | null;

  if (!REQUIRED_CLIENT_DOCUMENT_TYPES.includes(kycType as typeof REQUIRED_CLIENT_DOCUMENT_TYPES[number])) {
    return NextResponse.json(
      { error: `无效证件类型，支持：${REQUIRED_CLIENT_DOCUMENT_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  if (!file) {
    return NextResponse.json({ error: "请上传文件" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "文件大小不能超过5MB" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "仅支持 JPG/PNG/WebP/PDF 格式" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;

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

  const updatedCustomer = await prisma.customer.findFirst({
    where: { id, deletedAt: null },
    select: customerProfileSelect,
  });
  if (!updatedCustomer) {
    return NextResponse.json({ error: "客户不存在" }, { status: 404 });
  }

  const completion = getClientProfileCompletion(updatedCustomer);
  const profileCompletedAt = resolveProfileCompletedAt(updatedCustomer, completion.profileComplete);
  if (completion.documentsComplete || updatedCustomer.profileCompletedAt !== profileCompletedAt) {
    await prisma.customer.update({
      where: { id },
      data: {
        ...(completion.documentsComplete ? { creditLimit: 30000 } : {}),
        profileCompletedAt,
      },
    });
  }

  return NextResponse.json({
    id: doc.id,
    kycType: doc.kycType,
    status: doc.status,
    allDocumentsUploaded: completion.documentsComplete,
    profileComplete: completion.profileComplete,
    missingFields: completion.missingFields,
    missingDocTypes: completion.missingDocTypes,
  });
}
