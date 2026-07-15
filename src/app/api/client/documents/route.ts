import { NextRequest, NextResponse } from "next/server";
import {
  CLIENT_DOCUMENT_TYPE_LABELS,
  REQUIRED_CLIENT_DOCUMENT_TYPES,
  getClientBaseCreditLimit,
  getClientProfileCompletion,
  resolveProfileCompletedAt,
} from "@/lib/client-profile";
import { requireActiveClientSession } from "@/lib/portal-session";
import { prisma } from "@/lib/prisma";
import {
  deletePrivateFile,
  getCustomerDocumentAccessUrl,
  getPrivateFileContentType,
  privateStorageErrorResponse,
  uploadPrivateFile,
} from "@/lib/private-file-storage";

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
      remark: true,
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
  const baseLimit = getClientBaseCreditLimit(completion);
  const effectiveLimit = customer.creditLimitOverride != null ? Number(customer.creditLimitOverride) : baseLimit;

  return {
    documents: customer.kyc.map((document) => ({
      id: document.id,
      kycType: document.kycType,
      label: CLIENT_DOCUMENT_TYPE_LABELS[document.kycType] ?? document.kycType,
      documentUrl: document.documentUrl ? getCustomerDocumentAccessUrl(document.id) : null,
      mimeType: getPrivateFileContentType(document.documentUrl),
      status: document.status,
      verifiedAt: document.verifiedAt?.toISOString() ?? null,
      expiresAt: document.expiresAt?.toISOString() ?? null,
      remark: document.remark,
      createdAt: document.createdAt.toISOString(),
    })),
    creditLimit: effectiveLimit,
    allDocumentsUploaded: completion.documentsUploaded,
    allDocumentsVerified: completion.documentsComplete,
    profileComplete: completion.profileComplete,
    profileFieldsComplete: completion.profileFieldsComplete,
    documentsComplete: completion.documentsComplete,
    missingFields: completion.missingFields,
    missingDocTypes: completion.missingDocTypes,
    docTypes: REQUIRED_CLIENT_DOCUMENT_TYPES.map((type) => ({
      type,
      label: CLIENT_DOCUMENT_TYPE_LABELS[type],
      uploaded: completion.uploadedDocumentTypes.has(type),
      verified: completion.verifiedDocumentTypes.has(type),
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

  let storedReference: string;
  try {
    storedReference = await uploadPrivateFile({
      file,
      pathPrefix: `customers/${session.sub}/kyc/${kycType}`,
      maxBytes: MAX_FILE_SIZE,
      allowedMimeTypes: ALLOWED_TYPES,
      label: "证件文件",
    });
  } catch (error) {
    return privateStorageErrorResponse(error, "证件上传失败");
  }

  let result: {
    doc: { id: string; kycType: string; status: string };
    completion: ReturnType<typeof getClientProfileCompletion>;
    effectiveLimit: number;
    previousDocumentUrl: string | null;
  };
  try {
    result = await prisma.$transaction(async (tx) => {
      const previous = await tx.customerKyc.findUnique({
        where: { customerId_kycType: { customerId: session.sub, kycType } },
        select: { documentUrl: true },
      });
      const doc = await tx.customerKyc.upsert({
        where: { customerId_kycType: { customerId: session.sub, kycType } },
        create: {
          customerId: session.sub,
          kycType,
          documentUrl: storedReference,
          status: "UPLOADED",
        },
        update: {
          documentUrl: storedReference,
          status: "UPLOADED",
          verifiedAt: null,
          expiresAt: null,
          remark: null,
        },
        select: { id: true, kycType: true, status: true },
      });

      const customer = await tx.customer.findFirst({
        where: { id: session.sub, deletedAt: null },
        select: customerSelect,
      });
      if (!customer) throw new Error("CUSTOMER_NOT_FOUND");

      const completion = getClientProfileCompletion(customer);
      const baseLimit = getClientBaseCreditLimit(completion);
      await tx.customer.update({
        where: { id: session.sub },
        data: {
          creditLimit: baseLimit,
          profileCompletedAt: resolveProfileCompletedAt(customer, completion.profileComplete),
        },
      });

      return {
        doc,
        completion,
        effectiveLimit:
          customer.creditLimitOverride != null ? Number(customer.creditLimitOverride) : baseLimit,
        previousDocumentUrl: previous?.documentUrl ?? null,
      };
    });
  } catch (error) {
    await deletePrivateFile(storedReference).catch(() => undefined);
    if (error instanceof Error && error.message === "CUSTOMER_NOT_FOUND") {
      return NextResponse.json({ error: "客户不存在" }, { status: 404 });
    }
    throw error;
  }

  await deletePrivateFile(result.previousDocumentUrl).catch(() => undefined);
  const { doc, completion, effectiveLimit } = result;

  return NextResponse.json({
    id: doc.id,
    kycType: doc.kycType,
    label: CLIENT_DOCUMENT_TYPE_LABELS[kycType] ?? kycType,
    status: doc.status,
    allDocumentsUploaded: completion.documentsUploaded,
    allDocumentsVerified: completion.documentsComplete,
    profileComplete: completion.profileComplete,
    profileFieldsComplete: completion.profileFieldsComplete,
    documentsComplete: completion.documentsComplete,
    missingFields: completion.missingFields,
    missingDocTypes: completion.missingDocTypes,
    creditLimit: effectiveLimit,
  });
}
