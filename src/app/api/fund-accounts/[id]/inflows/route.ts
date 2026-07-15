import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLogInTransaction } from "@/lib/audit";
import {
  isCapitalInflowTransactionConstraintError,
  validateCapitalInflowEvidence,
} from "@/lib/capital-inflow-evidence";
import { getScopedIdempotencyKey, withIdempotencyResponse } from "@/lib/idempotency";
import { deletePrivateFile, privateStorageErrorResponse } from "@/lib/private-file-storage";
import { prisma } from "@/lib/prisma";
import {
  createProofAttachment,
  serializeProofAttachment,
  storeProofFile,
} from "@/lib/proof-attachment";
import { requirePermission } from "@/lib/rbac";
import { writeFundAccountLedgerEntryAndUpdateAccount } from "@/services/fund-account-ledger.service";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  amount: z.coerce.number().positive(),
  channel: z.string().trim().min(1).default("BANK_TRANSFER"),
  inflowDate: z.string().datetime().optional(),
  remark: z.string().trim().max(500).optional(),
});

async function parseCreateRequest(req: Request) {
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const proofValue = formData.get("proof");
    return {
      raw: {
        amount: formData.get("amount"),
        channel: formData.get("channel") || "BANK_TRANSFER",
        inflowDate: formData.get("inflowDate") || undefined,
        remark: formData.get("remark") || undefined,
        transactionId: formData.get("transactionId"),
        senderBank: formData.get("senderBank"),
        senderAccount: formData.get("senderAccount"),
        proofUrl: formData.get("proofUrl") || undefined,
        proofFileName: formData.get("proofFileName") || undefined,
        proofMimeType: formData.get("proofMimeType") || undefined,
      },
      proofFile: proofValue && typeof proofValue !== "string" ? proofValue : null,
    };
  }

  return { raw: await req.json().catch(() => ({})), proofFile: null };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission(["inflow:view"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const inflows = await prisma.capitalInflow.findMany({
    where: { fundAccountId: id },
    orderBy: { inflowDate: "desc" },
    take: 50,
    include: { reviewedBy: { select: { id: true, realName: true } } },
  });

  const inflowIds = inflows.map((item) => item.id);
  const attachments = inflowIds.length
    ? await prisma.attachment.findMany({
        where: {
          entityType: "capital_inflow",
          entityId: { in: inflowIds },
          deletedAt: null,
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          entityId: true,
          fileName: true,
          fileUrl: true,
          fileSize: true,
          mimeType: true,
          category: true,
          createdAt: true,
        },
      })
    : [];

  const proofsByInflowId = new Map<string, typeof attachments>();
  for (const attachment of attachments) {
    const current = proofsByInflowId.get(attachment.entityId) ?? [];
    current.push(attachment);
    proofsByInflowId.set(attachment.entityId, current);
  }

  return NextResponse.json({
    items: inflows.map((item) => ({
      ...item,
      amount: Number(item.amount),
      proofs: (proofsByInflowId.get(item.id) ?? []).map(serializeProofAttachment),
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission(["inflow:create"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const idemKey = getScopedIdempotencyKey(req, ["admin", session.sub, "capital-inflow-direct", id]);
  return withIdempotencyResponse(idemKey, async () => {
    const account = await prisma.fundAccount.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
    if (!account || !account.isActive) {
      return NextResponse.json({ error: "Fund account not found or inactive" }, { status: 404 });
    }

    const requestData = await parseCreateRequest(req).catch(() => null);
    if (!requestData) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = createSchema.safeParse(requestData.raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid capital inflow", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const evidence = validateCapitalInflowEvidence(requestData.raw, requestData.proofFile);
    if (!evidence.success) {
      return NextResponse.json(
        { error: evidence.error, details: evidence.details },
        { status: 400 },
      );
    }

    const { input: bankEvidence, proofFile } = evidence.data;
    let fileUrl = bankEvidence.proofUrl ?? "";
    let fileName = bankEvidence.proofFileName || "capital-inflow-proof";
    let fileSize = 0;
    let mimeType = bankEvidence.proofMimeType || "text/uri-list";

    if (proofFile) {
      try {
        fileUrl = await storeProofFile(proofFile, `admins/${session.sub}/inflows`);
        fileName = proofFile.name || fileName;
        fileSize = proofFile.size;
        mimeType = proofFile.type || "application/octet-stream";
      } catch (error) {
        return privateStorageErrorResponse(error, "Bank evidence upload failed");
      }
    }

    const inflowDate = parsed.data.inflowDate ? new Date(parsed.data.inflowDate) : new Date();

    try {
      const result = await prisma.$transaction(async (tx) => {
        const inflow = await tx.capitalInflow.create({
          data: {
            fundAccountId: id,
            amount: parsed.data.amount,
            channel: parsed.data.channel,
            transactionId: bankEvidence.transactionId,
            senderBank: bankEvidence.senderBank,
            senderAccount: bankEvidence.senderAccount,
            inflowDate,
            status: "CONFIRMED",
            remark: parsed.data.remark,
            reviewedAt: new Date(),
            reviewedById: session.sub,
          },
        });

        const proof = await createProofAttachment(tx, {
          entityType: "capital_inflow",
          entityId: inflow.id,
          fileName,
          fileUrl,
          fileSize,
          mimeType,
          uploadedBy: session.sub,
          category: "CAPITAL_INFLOW_PROOF",
        });

        const ledgerResult = await writeFundAccountLedgerEntryAndUpdateAccount(tx, {
          fundAccountId: id,
          type: "CAPITAL_INFLOW",
          direction: "CREDIT",
          amount: parsed.data.amount,
          totalInflowDelta: parsed.data.amount,
          referenceType: "capital_inflow",
          referenceId: inflow.id,
          operatorId: session.sub,
          description: `Capital injected via ${parsed.data.channel}`,
          metadata: {
            channel: parsed.data.channel,
            transactionId: bankEvidence.transactionId,
            senderBank: bankEvidence.senderBank,
            senderAccount: bankEvidence.senderAccount,
            inflowDate: inflowDate.toISOString(),
            remark: parsed.data.remark ?? null,
          },
        });

        await writeAuditLogInTransaction(tx, {
          userId: session.sub,
          action: "confirm",
          entityType: "capital_inflow",
          entityId: inflow.id,
          newValue: {
            fundAccountId: id,
            amount: Number(inflow.amount),
            channel: inflow.channel,
            transactionId: inflow.transactionId,
            senderBank: inflow.senderBank,
            senderAccount: inflow.senderAccount,
            status: inflow.status,
            reviewedById: session.sub,
            balanceAfter: Number(ledgerResult.account.balance),
          },
          changeSummary: "Create and immediately confirm capital inflow with bank evidence",
        });

        return { inflow, accountUpdate: ledgerResult.account, proof };
      });

      return NextResponse.json(
        {
          inflow: { ...result.inflow, amount: Number(result.inflow.amount) },
          account: {
            id: result.accountUpdate.id,
            balance: Number(result.accountUpdate.balance),
            totalInflow: Number(result.accountUpdate.totalInflow),
          },
          proof: serializeProofAttachment(result.proof),
        },
        { status: 201 },
      );
    } catch (error) {
      if (proofFile) await deletePrivateFile(fileUrl).catch(() => undefined);
      if (isCapitalInflowTransactionConstraintError(error)) {
        return NextResponse.json(
          { error: "This bank transaction ID is already used for the selected fund account" },
          { status: 409 },
        );
      }
      throw error;
    }
  });
}
