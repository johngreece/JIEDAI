import { NextRequest, NextResponse } from "next/server";
import {
  CLIENT_DOCUMENT_TYPE_LABELS,
  REQUIRED_CLIENT_DOCUMENT_TYPES,
  getClientProfileCompletion,
  resolveProfileCompletedAt,
} from "@/lib/client-profile";
import { requireActiveClientSession } from "@/lib/portal-session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const customerSelect = {
  id: true,
  phone: true,
  address: true,
  taxNumber: true,
  idNumber: true,
  passportNumber: true,
  residencePermitNumber: true,
  residencePermitExpiry: true,
  profileCompletedAt: true,
  creditLimit: true,
  creditLimitOverride: true,
  kyc: {
    select: {
      id: true,
      kycType: true,
      documentUrl: true,
      status: true,
      verifiedAt: true,
      expiresAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" as const },
  },
} as const;

async function loadCustomer(customerId: string) {
  return prisma.customer.findFirst({
    where: { id: customerId, deletedAt: null },
    select: customerSelect,
  });
}

function serializeDocuments(customer: NonNullable<Awaited<ReturnType<typeof loadCustomer>>>) {
  const completion = getClientProfileCompletion(customer);
  const baseLimit = completion.documentsComplete ? 30000 : 10000;
  const effectiveLimit = customer.creditLimitOverride != null ? Number(customer.creditLimitOverride) : baseLimit;

  return {
    documents: customer.kyc.map((document) => ({
      id: document.id,
      kycType: document.kycType,
      label: CLIENT_DOCUMENT_TYPE_LABELS[document.kycType] ?? document.kycType,
      documentUrl: document.documentUrl,
      status: document.status,
      verifiedAt: document.verifiedAt?.toISOString() ?? null,
      expiresAt: document.expiresAt?.toISOString() ?? null,
      createdAt: document.createdAt.toISOString(),
    })),
    creditLimit: effectiveLimit,
    allDocumentsUploaded: completion.documentsComplete,
    profileComplete: completion.profileComplete,
    profileFieldsComplete: completion.profileFieldsComplete,
    documentsComplete: completion.documentsComplete,
    missingFields: completion.missingFields,
    missingDocTypes: completion.missingDocTypes,
    docTypes: REQUIRED_CLIENT_DOCUMENT_TYPES.map((type) => ({
      type,
      label: CLIENT_DOCUMENT_TYPE_LABELS[type],
      uploaded: completion.validDocumentTypes.has(type),
    })),
  };
}

export async function GET() {
  const session = await requireActiveClientSession();
  if (session instanceof Response) return session;

  const customer = await loadCustomer(session.sub);
  if (!customer) {
    return NextResponse.json({ error: "客户不存在" }, { status: 404 });
  }

  return NextResponse.json(serializeDocuments(customer));
}

export async function POST(req: NextRequest) {
  const session = await requireActiveClientSession();
  if (session instanceof Response) return session;

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

  const customer = await loadCustomer(session.sub);
  if (!customer) {
    return NextResponse.json({ error: "客户不存在" }, { status: 404 });
  }

  const completion = getClientProfileCompletion(customer);
  const profileCompletedAt = resolveProfileCompletedAt(customer, completion.profileComplete);
  const effectiveLimit = customer.creditLimitOverride != null
    ? Number(customer.creditLimitOverride)
    : completion.documentsComplete
      ? 30000
      : 10000;
  if (completion.documentsComplete || customer.profileCompletedAt !== profileCompletedAt) {
    await prisma.customer.update({
      where: { id: session.sub },
      data: {
        ...(completion.documentsComplete ? { creditLimit: 30000 } : {}),
        profileCompletedAt,
      },
    });
  }

  return NextResponse.json({
    id: doc.id,
    kycType: doc.kycType,
    label: CLIENT_DOCUMENT_TYPE_LABELS[kycType] ?? kycType,
    status: doc.status,
    allDocumentsUploaded: completion.documentsComplete,
    profileComplete: completion.profileComplete,
    profileFieldsComplete: completion.profileFieldsComplete,
    documentsComplete: completion.documentsComplete,
    missingFields: completion.missingFields,
    missingDocTypes: completion.missingDocTypes,
    creditLimit: effectiveLimit,
  });
}
