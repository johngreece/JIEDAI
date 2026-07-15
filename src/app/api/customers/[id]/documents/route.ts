import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLogInTransaction } from "@/lib/audit";
import {
  REQUIRED_CLIENT_DOCUMENT_TYPES,
  getClientBaseCreditLimit,
  getClientProfileCompletion,
  resolveProfileCompletedAt,
} from "@/lib/client-profile";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const reviewSchema = z
  .object({
    kycType: z.enum(["CHINA_ID", "PASSPORT", "GREEK_RESIDENCE_PERMIT"]),
    action: z.enum(["VERIFY", "REJECT"]),
    remark: z.string().trim().max(500, "核验备注不能超过500个字符").optional().nullable(),
  })
  .superRefine((value, context) => {
    if (value.action === "REJECT" && !value.remark) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["remark"],
        message: "驳回证件时必须填写原因",
      });
    }
  });

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
  creditLimit: true,
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
      expiresAt: document.expiresAt?.toISOString() ?? null,
      remark: document.remark,
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

  const { doc, completion } = await prisma.$transaction(async (tx) => {
    const previous = await tx.customerKyc.findUnique({
      where: { customerId_kycType: { customerId: id, kycType } },
      select: { id: true, status: true, verifiedAt: true },
    });
    const uploaded = await tx.customerKyc.upsert({
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
        expiresAt: null,
        remark: null,
      },
    });

    const updatedCustomer = await tx.customer.findFirst({
      where: { id, deletedAt: null },
      select: customerProfileSelect,
    });
    if (!updatedCustomer) throw new Error("CUSTOMER_NOT_FOUND");

    const nextCompletion = getClientProfileCompletion(updatedCustomer);
    await tx.customer.update({
      where: { id },
      data: {
        creditLimit: getClientBaseCreditLimit(nextCompletion),
        profileCompletedAt: resolveProfileCompletedAt(
          updatedCustomer,
          nextCompletion.profileComplete
        ),
      },
    });
    await writeAuditLogInTransaction(tx, {
      userId: session.sub,
      action: previous ? "update" : "create",
      entityType: "customer",
      entityId: id,
      oldValue: previous
        ? {
            kycType,
            documentId: previous.id,
            status: previous.status,
            verifiedAt: previous.verifiedAt,
          }
        : null,
      newValue: {
        kycType,
        documentId: uploaded.id,
        status: uploaded.status,
        verifiedAt: uploaded.verifiedAt,
      },
      changeSummary: previous
        ? `Replace customer document ${kycType}; verification reset`
        : `Upload customer document ${kycType}`,
    });

    return { doc: uploaded, completion: nextCompletion };
  });

  return NextResponse.json({
    id: doc.id,
    kycType: doc.kycType,
    status: doc.status,
    allDocumentsUploaded: completion.documentsUploaded,
    allDocumentsVerified: completion.documentsComplete,
    profileComplete: completion.profileComplete,
    missingFields: completion.missingFields,
    missingDocTypes: completion.missingDocTypes,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["customer:edit"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const parsed = reviewSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "核验参数不正确" },
      { status: 400 }
    );
  }

  const { kycType, action, remark } = parsed.data;
  const result = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({
      where: { id, deletedAt: null },
      select: customerProfileSelect,
    });
    if (!customer) return { error: "客户不存在", status: 404 } as const;

    const document = await tx.customerKyc.findUnique({
      where: { customerId_kycType: { customerId: id, kycType } },
    });
    if (!document?.documentUrl) {
      return { error: "证件尚未上传", status: 404 } as const;
    }

    const allowedStatuses =
      action === "VERIFY"
        ? ["PENDING", "UPLOADED"]
        : ["PENDING", "UPLOADED", "VERIFIED"];
    if (!allowedStatuses.includes(document.status)) {
      return {
        error:
          document.status === "REJECTED"
            ? "已驳回证件必须重新上传后才能核验"
            : "证件状态已变化，请刷新后重试",
        status: 409,
      } as const;
    }

    const now = new Date();
    const nextStatus = action === "VERIFY" ? "VERIFIED" : "REJECTED";
    const updated = await tx.customerKyc.updateMany({
      where: {
        id: document.id,
        customerId: id,
        status: document.status,
      },
      data: {
        status: nextStatus,
        verifiedAt: action === "VERIFY" ? now : null,
        remark: remark || null,
      },
    });
    if (updated.count !== 1) {
      return { error: "证件状态已变化，请刷新后重试", status: 409 } as const;
    }

    const reviewedCustomer = await tx.customer.findFirst({
      where: { id, deletedAt: null },
      select: customerProfileSelect,
    });
    if (!reviewedCustomer) return { error: "客户不存在", status: 404 } as const;

    const completion = getClientProfileCompletion(reviewedCustomer, now);
    const baseCreditLimit = getClientBaseCreditLimit(completion);
    await tx.customer.update({
      where: { id },
      data: {
        creditLimit: baseCreditLimit,
        profileCompletedAt: resolveProfileCompletedAt(
          reviewedCustomer,
          completion.profileComplete,
          now
        ),
      },
    });
    await writeAuditLogInTransaction(tx, {
      userId: session.sub,
      action: action === "VERIFY" ? "approve" : "reject",
      entityType: "customer",
      entityId: id,
      oldValue: {
        kycType,
        documentId: document.id,
        status: document.status,
        verifiedAt: document.verifiedAt,
        remark: document.remark,
        creditLimit: Number(customer.creditLimit),
      },
      newValue: {
        kycType,
        documentId: document.id,
        status: nextStatus,
        verifiedAt: action === "VERIFY" ? now : null,
        remark: remark || null,
        creditLimit: baseCreditLimit,
      },
      changeSummary:
        action === "VERIFY"
          ? `Verify customer document ${kycType}`
          : `Reject customer document ${kycType}`,
    });

    return {
      document: {
        id: document.id,
        kycType,
        status: nextStatus,
        verifiedAt: action === "VERIFY" ? now.toISOString() : null,
        remark: remark || null,
      },
      allDocumentsUploaded: completion.documentsUploaded,
      allDocumentsVerified: completion.documentsComplete,
      profileComplete: completion.profileComplete,
      creditLimit: baseCreditLimit,
    } as const;
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
