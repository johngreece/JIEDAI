import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FunderInterestService } from "@/services/funder-interest.service";
import { FunderNotificationService } from "@/services/funder-notification.service";
import { getScopedIdempotencyKey, withIdempotencyResponse } from "@/lib/idempotency";
import { requirePermission } from "@/lib/rbac";
import { formatMoney as money } from "@/lib/system-config";
import { validateBankTransactionEvidence } from "@/lib/disbursement-evidence";
import { serializeProofAttachment, storeProofFile } from "@/lib/proof-attachment";
import { deletePrivateFile, privateStorageErrorResponse } from "@/lib/private-file-storage";

export const dynamic = "force-dynamic";

function isWithdrawalTransactionConstraintError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const target = Array.isArray(error.meta?.target)
    ? error.meta.target.join(" ")
    : String(error.meta?.target ?? "");

  return target.includes("account_id") && target.includes("transaction_id");
}

/* GET — 管理端查看所有提现申请 */
export async function GET() {
  const session = await requirePermission(["withdrawal:view"]);
  if (session instanceof Response) return session;

  const withdrawals = await prisma.funderWithdrawal.findMany({
    orderBy: { createdAt: "desc" },
    include: { funder: { select: { name: true, cooperationMode: true } } },
  });

  const withdrawalIds = withdrawals.map((withdrawal) => withdrawal.id);
  const proofs = withdrawalIds.length
    ? await prisma.attachment.findMany({
        where: {
          entityType: "funder_withdrawal",
          entityId: { in: withdrawalIds },
          deletedAt: null,
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          entityId: true,
          fileName: true,
          fileUrl: true,
          mimeType: true,
          createdAt: true,
        },
      })
    : [];
  const proofsByWithdrawalId = new Map<string, typeof proofs>();
  for (const proof of proofs) {
    const current = proofsByWithdrawalId.get(proof.entityId) ?? [];
    current.push(proof);
    proofsByWithdrawalId.set(proof.entityId, current);
  }

  return NextResponse.json(
    withdrawals.map((w) => ({
      id: w.id,
      funderId: w.funderId,
      funderName: w.funder.name,
      cooperationMode: w.funder.cooperationMode,
      amount: Number(w.amount),
      type: w.type,
      status: w.status,
      includeInterest: w.includeInterest,
      interestAmount: Number(w.interestAmount),
      transactionId: w.transactionId,
      payerBank: w.payerBank,
      payerAccount: w.payerAccount,
      proofs: (proofsByWithdrawalId.get(w.id) ?? []).map(serializeProofAttachment),
      remark: w.remark,
      createdAt: w.createdAt,
      approvedAt: w.approvedAt,
      rejectedReason: w.rejectedReason,
    }))
  );
}

/* PATCH — 审批提现申请 */
export async function PATCH(req: NextRequest) {
  const session = await requirePermission(["withdrawal:review"]);
  if (session instanceof Response) return session;

  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  let body: Record<string, unknown> = {};
  let proofFile: File | null = null;
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
    }
    const proofValue = formData.get("proof");
    proofFile = proofValue && typeof proofValue !== "string" ? proofValue : null;
    body = {
      withdrawalId: formData.get("withdrawalId"),
      action: formData.get("action"),
      reason: formData.get("reason"),
      transactionId: formData.get("transactionId"),
      proofUrl: formData.get("proofUrl") || undefined,
      proofFileName: formData.get("proofFileName") || undefined,
      proofMimeType: formData.get("proofMimeType") || undefined,
    };
  } else {
    body = await req.json().catch(() => ({}));
  }
  const { withdrawalId, action, reason } = body;

  if (
    typeof withdrawalId !== "string" ||
    typeof action !== "string" ||
    !["approve", "reject"].includes(action)
  ) {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }

  const parsedEvidence = action === "approve"
    ? validateBankTransactionEvidence(body, proofFile)
    : null;
  if (parsedEvidence && !parsedEvidence.success) {
    return NextResponse.json(
      { error: parsedEvidence.error, details: parsedEvidence.details },
      { status: 400 },
    );
  }

  const idemKey = getScopedIdempotencyKey(req, ["admin", session.sub, "funder-withdrawal-review", withdrawalId, action]);
  return withIdempotencyResponse(idemKey, async () => {

  let uploadedPrivateFileReference: string | null = null;
  try {
    let result: unknown;
    if (action === "approve") {
      if (!parsedEvidence?.success) {
        return NextResponse.json({ error: "Bank transaction evidence is required" }, { status: 400 });
      }

      const { input: evidenceInput } = parsedEvidence.data;
      let proofFileUrl = evidenceInput.proofUrl ?? "";
      let proofFileName = evidenceInput.proofFileName || `bank-evidence-${evidenceInput.transactionId}`;
      let proofFileSize = 0;
      let proofMimeType = evidenceInput.proofMimeType || "text/uri-list";

      if (parsedEvidence.data.proofFile) {
        const upload = parsedEvidence.data.proofFile;
        try {
          proofFileUrl = await storeProofFile(upload, `funder-withdrawals/${withdrawalId}`);
          uploadedPrivateFileReference = proofFileUrl;
          proofFileName = upload.name || proofFileName;
          proofFileSize = upload.size;
          proofMimeType = upload.type || "application/octet-stream";
        } catch (error) {
          return privateStorageErrorResponse(error, "Withdrawal payment evidence upload failed");
        }
      }

      const approved = await FunderInterestService.approveWithdrawal(
        withdrawalId,
        session.sub,
        {
          transactionId: evidenceInput.transactionId,
          proof: {
            fileName: proofFileName,
            fileUrl: proofFileUrl,
            fileSize: proofFileSize,
            mimeType: proofMimeType,
          },
        },
      );
      result = {
        ...approved,
        proofAttachment: serializeProofAttachment(approved.proofAttachment),
      };
      await FunderNotificationService.send(
        approved.funderId,
        "WITHDRAWAL_APPROVED",
        "提现款项已出账",
        `你的提现申请 ${money(approved.amount)} 已完成银行出账，交易号 ${approved.transactionId}。`,
      ).catch((error) => console.error("[FunderWithdrawal] approve notification", error));
    } else {
      const rejected = await FunderInterestService.rejectWithdrawal(
        withdrawalId,
        session.sub,
        typeof reason === "string" && reason.trim() ? reason.trim() : "管理员拒绝",
      );
      result = rejected;
      await FunderNotificationService.send(
        rejected.funderId,
        "WITHDRAWAL_REJECTED",
        "提现申请已拒绝",
        `你的提现申请 ${money(Number(rejected.amount))} 未通过审核。原因：${rejected.rejectedReason || "管理员拒绝"}`,
      ).catch((error) => console.error("[FunderWithdrawal] reject notification", error));
    }
    const responseBody = { ok: true, result };
    return NextResponse.json(responseBody);
  } catch (e) {
    if (uploadedPrivateFileReference) {
      await deletePrivateFile(uploadedPrivateFileReference).catch((cleanupError) => {
        console.error("[funder-withdrawal] failed to clean uploaded evidence", cleanupError);
      });
    }
    const message = e instanceof Error ? e.message : "";
    if (
      message === "WITHDRAWAL_TRANSACTION_ID_DUPLICATE" ||
      isWithdrawalTransactionConstraintError(e)
    ) {
      return NextResponse.json(
        { error: "This bank transaction ID is already used for the selected fund account" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "操作失败" },
      { status: 400 }
    );
  }
  });
}
