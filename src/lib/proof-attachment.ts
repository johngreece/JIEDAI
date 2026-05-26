import type { Prisma } from "@prisma/client";

export const MAX_PROOF_FILE_SIZE = 10 * 1024 * 1024;

export const ALLOWED_PROOF_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export async function fileToDataUrl(file: File) {
  if (file.size <= 0) {
    throw new Error("凭证文件不能为空");
  }

  if (file.size > MAX_PROOF_FILE_SIZE) {
    throw new Error("凭证文件不能超过 10MB");
  }

  if (!ALLOWED_PROOF_MIME_TYPES.includes(file.type as (typeof ALLOWED_PROOF_MIME_TYPES)[number])) {
    throw new Error("凭证仅支持 JPG/PNG/WebP/PDF");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buffer.toString("base64")}`;
}

export async function createProofAttachment(
  tx: Prisma.TransactionClient,
  params: {
    entityType: string;
    entityId: string;
    fileName: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
    uploadedBy: string;
    category: string;
  },
) {
  return tx.attachment.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      fileName: params.fileName,
      fileUrl: params.fileUrl,
      fileSize: params.fileSize,
      mimeType: params.mimeType,
      uploadedBy: params.uploadedBy,
      category: params.category,
    },
    select: {
      id: true,
      fileName: true,
      fileUrl: true,
      fileSize: true,
      mimeType: true,
      category: true,
      createdAt: true,
    },
  });
}
