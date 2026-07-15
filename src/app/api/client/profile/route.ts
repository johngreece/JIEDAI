import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  CLIENT_DOCUMENT_TYPE_LABELS,
  REQUIRED_CLIENT_DOCUMENT_TYPES,
  REQUIRED_CLIENT_PROFILE_FIELDS,
  getClientBaseCreditLimit,
  getClientProfileCompletion,
  resolveProfileCompletedAt,
} from "@/lib/client-profile";
import { normalizePhoneInput } from "@/lib/phone";
import { requireActiveClientSession } from "@/lib/portal-session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const textField = (label: string, max = 120) =>
  z
    .string({ required_error: `${label}必填` })
    .trim()
    .min(1, `${label}必填`)
    .max(max, `${label}不能超过${max}个字符`);

const profileSchema = z.object({
  phone: z
    .string({ required_error: "电话必填" })
    .trim()
    .min(3, "电话必填")
    .max(40, "电话不能超过40个字符")
    .transform((value) => normalizePhoneInput(value))
    .refine((value) => value.length >= 3, "电话必填"),
  address: textField("地址", 300),
  taxNumber: textField("税号", 80),
  idNumber: textField("身份证号", 80),
  passportNumber: textField("护照号", 80),
  residencePermitNumber: textField("居留卡号", 80),
  residencePermitExpiry: z
    .string({ required_error: "居留有效期必填" })
    .trim()
    .min(1, "居留有效期必填")
    .refine((value) => {
      const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime());
    }, "居留有效期格式不正确"),
});

const customerProfileSelect = {
  id: true,
  name: true,
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

function toDateInput(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function serializeCustomerProfile(customer: NonNullable<Awaited<ReturnType<typeof loadCustomerProfile>>>) {
  const completion = getClientProfileCompletion(customer);
  const baseLimit = getClientBaseCreditLimit(completion);
  const effectiveLimit = customer.creditLimitOverride != null ? Number(customer.creditLimitOverride) : baseLimit;

  return {
    profile: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      address: customer.address ?? "",
      taxNumber: customer.taxNumber ?? "",
      idNumber: customer.idNumber ?? "",
      passportNumber: customer.passportNumber ?? "",
      residencePermitNumber: customer.residencePermitNumber ?? "",
      residencePermitExpiry: toDateInput(customer.residencePermitExpiry),
      profileCompletedAt: completion.profileComplete
        ? customer.profileCompletedAt?.toISOString() ?? null
        : null,
    },
    documents: customer.kyc.map((document) => ({
      id: document.id,
      kycType: document.kycType,
      label: CLIENT_DOCUMENT_TYPE_LABELS[document.kycType] ?? document.kycType,
      documentUrl: document.documentUrl,
      status: document.status,
      verifiedAt: document.verifiedAt?.toISOString() ?? null,
      expiresAt: document.expiresAt?.toISOString() ?? null,
      remark: document.remark,
      createdAt: document.createdAt.toISOString(),
    })),
    docTypes: REQUIRED_CLIENT_DOCUMENT_TYPES.map((type) => ({
      type,
      label: CLIENT_DOCUMENT_TYPE_LABELS[type],
      uploaded: completion.uploadedDocumentTypes.has(type),
      verified: completion.verifiedDocumentTypes.has(type),
    })),
    requiredFields: REQUIRED_CLIENT_PROFILE_FIELDS,
    creditLimit: effectiveLimit,
    allDocumentsUploaded: completion.documentsUploaded,
    allDocumentsVerified: completion.documentsComplete,
    profileFieldsComplete: completion.profileFieldsComplete,
    documentsComplete: completion.documentsComplete,
    profileComplete: completion.profileComplete,
    missingFields: completion.missingFields,
    missingDocTypes: completion.missingDocTypes,
  };
}

async function loadCustomerProfile(customerId: string) {
  return prisma.customer.findFirst({
    where: { id: customerId, deletedAt: null },
    select: customerProfileSelect,
  });
}

function parseDateInput(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

export async function GET() {
  const session = await requireActiveClientSession();
  if (session instanceof Response) return session;

  const customer = await loadCustomerProfile(session.sub);
  if (!customer) {
    return NextResponse.json({ error: "客户不存在" }, { status: 404 });
  }

  return NextResponse.json(serializeCustomerProfile(customer));
}

export async function PUT(req: NextRequest) {
  const session = await requireActiveClientSession();
  if (session instanceof Response) return session;

  const body = await req.json().catch(() => ({}));
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "资料未填写完整", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const input = parsed.data;
  const residencePermitExpiry = parseDateInput(input.residencePermitExpiry);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (residencePermitExpiry < today) {
    return NextResponse.json({ error: "居留有效期不能早于今天" }, { status: 400 });
  }

  const existing = await prisma.customer.findFirst({
    where: { id: session.sub, deletedAt: null },
    select: { id: true, phone: true, idNumber: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "客户不存在" }, { status: 404 });
  }

  const conflict = await prisma.customer.findFirst({
    where: {
      deletedAt: null,
      id: { not: session.sub },
      OR: [{ phone: input.phone }, { idNumber: input.idNumber }],
    },
    select: { phone: true, idNumber: true },
  });
  if (conflict?.phone === input.phone) {
    return NextResponse.json({ error: "电话已被其他客户使用" }, { status: 409 });
  }
  if (conflict?.idNumber === input.idNumber) {
    return NextResponse.json({ error: "身份证号已被其他客户使用" }, { status: 409 });
  }

  const saved = await prisma.customer.update({
    where: { id: session.sub },
    data: {
      phone: input.phone,
      address: input.address,
      taxNumber: input.taxNumber,
      idNumber: input.idNumber,
      passportNumber: input.passportNumber,
      residencePermitNumber: input.residencePermitNumber,
      residencePermitExpiry,
    },
    select: customerProfileSelect,
  });

  const completion = getClientProfileCompletion(saved);
  const profileCompletedAt = resolveProfileCompletedAt(saved, completion.profileComplete);
  const finalCustomer = await prisma.customer.update({
    where: { id: session.sub },
    data: {
      profileCompletedAt,
      creditLimit: getClientBaseCreditLimit(completion),
    },
    select: customerProfileSelect,
  });

  return NextResponse.json(serializeCustomerProfile(finalCustomer));
}
