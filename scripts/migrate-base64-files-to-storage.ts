import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  deletePrivateFile,
  readPrivateFile,
  uploadPrivateBytes,
} from "../src/lib/private-file-storage";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
type CustomerDocumentMigrationRow = {
  id: string;
  customerId: string;
  kycType: string;
  documentUrl: string | null;
  updatedAt: Date;
};
type AttachmentMigrationRow = {
  id: string;
  entityType: string;
  entityId: string;
  fileUrl: string;
  mimeType: string;
  createdAt: Date;
};

async function migrateCustomerDocuments() {
  const found = await prisma.customerKyc.count({
    where: { documentUrl: { startsWith: "data:" } },
  });
  if (!apply) return { found, migrated: 0, skipped: found };

  let migrated = 0;
  let skipped = 0;
  let afterId: string | null = null;
  while (true) {
    const documents: CustomerDocumentMigrationRow[] = await prisma.customerKyc.findMany({
      where: {
        documentUrl: { startsWith: "data:" },
        ...(afterId ? { id: { gt: afterId } } : {}),
      },
      orderBy: { id: "asc" },
      take: 25,
      select: {
        id: true,
        customerId: true,
        kycType: true,
        documentUrl: true,
        updatedAt: true,
      },
    });
    if (documents.length === 0) break;

    for (const document of documents) {
      afterId = document.id;
      if (!document.documentUrl) continue;
      const legacy = await readPrivateFile(document.documentUrl);
      const reference = await uploadPrivateBytes({
        bytes: legacy.bytes,
        contentType: legacy.contentType,
        pathPrefix: `customers/${document.customerId}/kyc/${document.kycType}`,
        label: "证件文件",
      });

      let updated;
      try {
        updated = await prisma.customerKyc.updateMany({
          where: {
            id: document.id,
            updatedAt: document.updatedAt,
            documentUrl: { startsWith: "data:" },
          },
          data: { documentUrl: reference },
        });
      } catch (error) {
        await deletePrivateFile(reference).catch(() => undefined);
        throw error;
      }
      if (updated.count === 1) migrated += 1;
      else {
        skipped += 1;
        await deletePrivateFile(reference).catch(() => undefined);
      }
    }
  }

  return { found, migrated, skipped };
}

async function migrateAttachments() {
  const found = await prisma.attachment.count({
    where: { fileUrl: { startsWith: "data:" }, deletedAt: null },
  });
  if (!apply) return { found, migrated: 0, skipped: found };

  let migrated = 0;
  let skipped = 0;
  let afterId: string | null = null;
  while (true) {
    const attachments: AttachmentMigrationRow[] = await prisma.attachment.findMany({
      where: {
        fileUrl: { startsWith: "data:" },
        deletedAt: null,
        ...(afterId ? { id: { gt: afterId } } : {}),
      },
      orderBy: { id: "asc" },
      take: 25,
      select: {
        id: true,
        entityType: true,
        entityId: true,
        fileUrl: true,
        mimeType: true,
        createdAt: true,
      },
    });
    if (attachments.length === 0) break;

    for (const attachment of attachments) {
      afterId = attachment.id;
      const legacy = await readPrivateFile(attachment.fileUrl);
      const reference = await uploadPrivateBytes({
        bytes: legacy.bytes,
        contentType: legacy.contentType || attachment.mimeType,
        pathPrefix: `attachments/${attachment.entityType}/${attachment.entityId}`,
        label: "凭证文件",
      });

      let updated;
      try {
        updated = await prisma.attachment.updateMany({
          where: {
            id: attachment.id,
            createdAt: attachment.createdAt,
            fileUrl: { startsWith: "data:" },
          },
          data: { fileUrl: reference },
        });
      } catch (error) {
        await deletePrivateFile(reference).catch(() => undefined);
        throw error;
      }
      if (updated.count === 1) migrated += 1;
      else {
        skipped += 1;
        await deletePrivateFile(reference).catch(() => undefined);
      }
    }
  }

  return { found, migrated, skipped };
}

async function main() {
  const customerDocuments = await migrateCustomerDocuments();
  const attachments = await migrateAttachments();
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", customerDocuments, attachments }, null, 2));
  if (!apply && customerDocuments.found + attachments.found > 0) {
    console.log("Dry run only. Re-run with --apply after verifying the private bucket and backup.");
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
