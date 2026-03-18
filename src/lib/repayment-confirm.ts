/**
 * 还款确认与状态机
 * - 财务登记 -> matched/pending_confirm -> 客户确认 -> confirmed
 * - 未经客户确认不自动完结，可人工复核
 */

import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";
import { writeAuditLog } from "./audit";
import { recordRepaymentLedger } from "@/services/ledger.service";
import { resolveOverdue } from "@/services/overdue.service";

export type RepaymentStatus =
  | "PENDING"
  | "MATCHED"
  | "PENDING_CONFIRM"
  | "CONFIRMED"
  | "REJECTED"
  | "MANUAL_REVIEW";

const ALLOWED_TRANSITIONS: Record<RepaymentStatus, RepaymentStatus[]> = {
  PENDING: ["MATCHED", "MANUAL_REVIEW"],
  MATCHED: ["PENDING_CONFIRM"],
  PENDING_CONFIRM: ["CONFIRMED", "REJECTED", "MANUAL_REVIEW"],
  CONFIRMED: [],
  REJECTED: ["MANUAL_REVIEW"],
  MANUAL_REVIEW: ["CONFIRMED", "REJECTED"],
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
  action: "CONFIRMED" | "REJECTED";
  signatureData?: string;
  rejectReason?: string;
  ipAddress: string;
  deviceInfo?: string;
  operatorId: string;
}) {
  const repayment = await prisma.repayment.findUnique({
    where: { id: params.repaymentId },
  });
  if (!repayment)
    throw new Error("Repayment not found");
  if (params.action === "CONFIRMED" && !canTransition(repayment.status as RepaymentStatus, "CONFIRMED"))
    throw new Error(`Cannot confirm from status ${repayment.status}`);
  if (params.action === "REJECTED" && !canTransition(repayment.status as RepaymentStatus, "REJECTED"))
    throw new Error(`Cannot reject from status ${repayment.status}`);

  const newStatus = params.action === "CONFIRMED" ? "CONFIRMED" : "REJECTED";
  const now = new Date();

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.repaymentConfirmation.create({
      data: {
        repaymentId: params.repaymentId,
        customerId: params.customerId,
        signatureData: params.signatureData,
        ipAddress: params.ipAddress,
        deviceInfo: params.deviceInfo,
        status: newStatus,
        rejectReason: params.rejectReason,
        confirmedAt: params.action === "CONFIRMED" ? now : null,
      },
    });
    await tx.repayment.update({
      where: { id: params.repaymentId },
      data: { status: newStatus },
    });

    // 确认成功：写入台账 + 更新还款计划条目 + 解除逾期
    if (params.action === "CONFIRMED") {
      await recordRepaymentLedger(tx, {
        repaymentId: params.repaymentId,
        principalPart: repayment.principalPart,
        interestPart: repayment.interestPart,
        feePart: repayment.feePart,
        penaltyPart: repayment.penaltyPart,
        customerId: params.customerId,
        operatorId: params.operatorId,
      });

      // 更新分配到的还款计划条目状态
      const allocations = await tx.repaymentAllocation.findMany({
        where: { repaymentId: params.repaymentId },
      });
      for (const alloc of allocations) {
        await tx.repaymentScheduleItem.update({
          where: { id: alloc.itemId },
          data: { status: "PAID", paidAt: now },
        });
        // 解除该条目的逾期记录
        await resolveOverdue(alloc.itemId);
      }
    }
  });

  await writeAuditLog({
    userId: params.operatorId,
    action: "repay_confirm",
    entityType: "repayment_confirmation",
    entityId: params.repaymentId,
    newValue: {
      action: params.action,
      ipAddress: params.ipAddress,
      deviceInfo: params.deviceInfo,
    },
  });
}
