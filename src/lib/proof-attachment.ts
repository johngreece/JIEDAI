import type { Prisma } from "@prisma/client";
import {
  ALLOWED_PRIVATE_FILE_MIME_TYPES,
  getAttachmentAccessUrl,
  uploadPrivateFile,
} from "./private-file-storage";

export const MAX_PROOF_FILE_SIZE = 10 * 1024 * 1024;

export const ALLOWED_PROOF_MIME_TYPES = [
  ...ALLOWED_PRIVATE_FILE_MIME_TYPES,
] as const;

export async function storeProofFile(file: File, pathPrefix: string) {
  return uploadPrivateFile({
    file,
    pathPrefix,
    maxBytes: MAX_PROOF_FILE_SIZE,
    allowedMimeTypes: ALLOWED_PROOF_MIME_TYPES,
    label: "凭证文件",
  });
}

export function serializeProofAttachment<
  T extends { id: string; fileUrl: string },
>(attachment: T) {
  const accessUrl = getAttachmentAccessUrl(attachment.id);
  return { ...attachment, fileUrl: accessUrl, accessUrl };
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
