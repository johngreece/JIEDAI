/**
 * 还款确认与状态机
 * - 财务登记 -> matched/pending_confirm -> 客户确认 -> confirmed
 * - 未经客户确认不自动完结，可人工复核
 */

import { prisma } from "./prisma";
import { writeAuditLog } from "./audit";

export type RepaymentStatus =
  | "registered"
  | "matched"
  | "pending_confirm"
  | "confirmed"
  | "rejected"
  | "manual_review";

const ALLOWED_TRANSITIONS: Record<RepaymentStatus, RepaymentStatus[]> = {
  registered: ["matched", "manual_review"],
  matched: ["pending_confirm"],
  pending_confirm: ["confirmed", "rejected", "manual_review"],
  confirmed: [],
  rejected: ["manual_review"],
  manual_review: ["confirmed", "rejected"],
};

export function canTransition(
  from: RepaymentStatus,
  to: RepaymentStatus
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export async function confirmRepayment(params: {
  repaymentId: string;
  customerId: string;
  confirmedAmount: string;
  confirmedUsage?: string;
  result: "confirmed" | "rejected";
  ipAddress?: string;
  deviceInfo?: string;
  signImageUrl?: string;
  signData?: Record<string, unknown>;
}) {
  const repayment = await prisma.repayment.findUnique({
    where: { id: params.repaymentId },
  });
  if (!repayment)
    throw new Error("Repayment not found");
  if (!canTransition(repayment.status as RepaymentStatus, "confirmed") && params.result === "confirmed")
    throw new Error(`Cannot confirm from status ${repayment.status}`);
  if (params.result === "rejected" && !canTransition(repayment.status as RepaymentStatus, "rejected"))
    throw new Error(`Cannot reject from status ${repayment.status}`);

  const newStatus = params.result === "confirmed" ? "confirmed" : "rejected";
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.repaymentConfirmation.create({
      data: {
        repaymentId: params.repaymentId,
        customerId: params.customerId,
        confirmedAmount: params.confirmedAmount,
        confirmedUsage: params.confirmedUsage,
        result: params.result,
        confirmedAt: now,
        ipAddress: params.ipAddress,
        deviceInfo: params.deviceInfo,
        signImageUrl: params.signImageUrl,
        signData: params.signData ?? undefined,
      },
    });
    await tx.repayment.update({
      where: { id: params.repaymentId },
      data: {
        status: newStatus,
        customerConfirmedAt: params.result === "confirmed" ? now : null,
      },
    });
  });

  await writeAuditLog({
    userId: null,
    action: "repay_confirm",
    entityType: "repayment_confirmation",
    entityId: params.repaymentId,
    newValue: {
      result: params.result,
      confirmedAmount: params.confirmedAmount,
      confirmedUsage: params.confirmedUsage,
      ipAddress: params.ipAddress,
      deviceInfo: params.deviceInfo,
    },
  });
}
