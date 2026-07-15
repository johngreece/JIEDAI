import { createHash } from "crypto";
import { Prisma } from "@prisma/client";

export const REPAYMENT_CONFIRMATION_EVIDENCE_ACTION = {
  CLIENT_DECLARED_PAID: "CLIENT_DECLARED_PAID",
  CLIENT_REJECTED: "CLIENT_REJECTED",
  ADMIN_CONFIRMED_RECEIVED: "ADMIN_CONFIRMED_RECEIVED",
  ADMIN_CONFIRMED_NOT_RECEIVED: "ADMIN_CONFIRMED_NOT_RECEIVED",
  ADMIN_CANCELLED: "ADMIN_CANCELLED",
} as const;

type EvidenceAction =
  (typeof REPAYMENT_CONFIRMATION_EVIDENCE_ACTION)[keyof typeof REPAYMENT_CONFIRMATION_EVIDENCE_ACTION];

type AppendRepaymentConfirmationEvidenceParams = {
  repaymentId: string;
  customerId: string;
  actorType: "CLIENT" | "ADMIN";
  actorId: string;
  action: EvidenceAction;
  fromStatus: string;
  toStatus: string;
  confirmedAmount?: string | number | Prisma.Decimal | null;
  signatureData?: string | null;
  ipAddress?: string | null;
  deviceInfo?: string | null;
  reason?: string | null;
  occurredAt: Date;
  details?: Record<string, unknown>;
};

export async function appendRepaymentConfirmationEvidence(
  tx: Prisma.TransactionClient,
  params: AppendRepaymentConfirmationEvidenceParams,
) {
  const confirmedAmount =
    params.confirmedAmount == null ? null : new Prisma.Decimal(params.confirmedAmount);
  const signatureHash = params.signatureData
    ? createHash("sha256").update(params.signatureData).digest("hex")
    : null;
  const evidenceJson = JSON.stringify({
    schemaVersion: 1,
    repaymentId: params.repaymentId,
    customerId: params.customerId,
    actorType: params.actorType,
    actorId: params.actorId,
    action: params.action,
    fromStatus: params.fromStatus,
    toStatus: params.toStatus,
    confirmedAmount: confirmedAmount?.toFixed(4) ?? null,
    signatureSha256: signatureHash,
    ipAddress: params.ipAddress ?? null,
    deviceInfo: params.deviceInfo ?? null,
    reason: params.reason ?? null,
    occurredAt: params.occurredAt.toISOString(),
    details: params.details ?? null,
  });
  const evidenceHash = createHash("sha256").update(evidenceJson).digest("hex");

  return tx.repaymentConfirmationEvent.create({
    data: {
      repaymentId: params.repaymentId,
      customerId: params.customerId,
      actorType: params.actorType,
      actorId: params.actorId,
      action: params.action,
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
      confirmedAmount,
      signatureData: params.signatureData,
      ipAddress: params.ipAddress,
      deviceInfo: params.deviceInfo,
      reason: params.reason,
      evidenceJson,
      evidenceHash,
      createdAt: params.occurredAt,
    },
  });
}
