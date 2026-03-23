/**
 * Repayment confirmation workflow
 * - Admin allocates a repayment to schedule items -> PENDING_CONFIRM
 * - Customer declares "I have paid" -> CUSTOMER_CONFIRMED
 * - Admin confirms money actually received -> CONFIRMED
 * - If admin marks not received, the repayment stays rejected and the schedule keeps accruing
 */

import { Prisma } from "@prisma/client";
import { writeAuditLog } from "./audit";
import { prisma } from "./prisma";
import { recordRepaymentLedger } from "@/services/ledger.service";
import { resolveOverdue } from "@/services/overdue.service";
import {
  DEFAULT_OVERDUE,
  DEFAULT_TIERS,
  DEFAULT_UPFRONT_FEE_RATE,
  calculateRealtimeRepayment,
  type ChannelType,
  type OverdueConfig,
  type RepaymentTier,
} from "@/lib/interest-engine";

export type RepaymentStatus =
  | "PENDING"
  | "MATCHED"
  | "PENDING_CONFIRM"
  | "CUSTOMER_CONFIRMED"
  | "CONFIRMED"
  | "REJECTED"
  | "MANUAL_REVIEW";

const EPSILON = 0.0001;

const ALLOWED_TRANSITIONS: Record<RepaymentStatus, RepaymentStatus[]> = {
  PENDING: ["MATCHED", "MANUAL_REVIEW"],
  MATCHED: ["PENDING_CONFIRM"],
  PENDING_CONFIRM: ["CUSTOMER_CONFIRMED", "REJECTED", "MANUAL_REVIEW"],
  CUSTOMER_CONFIRMED: ["CONFIRMED", "REJECTED", "MANUAL_REVIEW"],
  CONFIRMED: [],
  REJECTED: ["MANUAL_REVIEW"],
  MANUAL_REVIEW: ["PENDING_CONFIRM", "CUSTOMER_CONFIRMED", "CONFIRMED", "REJECTED"],
};

export function canTransition(from: RepaymentStatus, to: RepaymentStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

function getRealtimeOutstandingAtPaymentTime(params: {
  rulesSnapshotJson: string | null;
  principal: number;
  disbursedAt: Date | null | undefined;
  paymentTime: Date;
}): number | null {
  const { rulesSnapshotJson, principal, disbursedAt, paymentTime } = params;
  if (!rulesSnapshotJson || !disbursedAt) return null;

  try {
    const snapshot = JSON.parse(rulesSnapshotJson) as {
      channel?: ChannelType;
      upfrontFeeRate?: number;
      tiers?: RepaymentTier[];
      overdueConfig?: OverdueConfig;
      dueDate?: string;
    };

    if (!snapshot.dueDate) return null;

    const realtime = calculateRealtimeRepayment({
      principal,
      channel: snapshot.channel ?? "FULL_AMOUNT",
      upfrontFeeRate: snapshot.upfrontFeeRate ?? DEFAULT_UPFRONT_FEE_RATE,
      tiers: snapshot.tiers ?? DEFAULT_TIERS,
      overdueConfig: snapshot.overdueConfig ?? DEFAULT_OVERDUE,
      startTime: new Date(disbursedAt),
      dueDate: new Date(snapshot.dueDate),
      currentTime: paymentTime,
    });

    return realtime.totalRepayment;
  } catch {
    return null;
  }
}

export async function confirmRepayment(params: {
  repaymentId: string;
  customerId: string;
  action: "CONFIRMED" | "DECLARED_PAID" | "REJECTED";
  signatureData?: string;
  rejectReason?: string;
  ipAddress: string;
  deviceInfo?: string;
  operatorId: string;
}) {
  const repayment = await prisma.repayment.findUnique({
    where: { id: params.repaymentId },
  });

  if (!repayment) {
    throw new Error("Repayment not found");
  }

  const targetStatus: RepaymentStatus =
    params.action === "REJECTED" ? "REJECTED" : "CUSTOMER_CONFIRMED";

  if (!canTransition(repayment.status as RepaymentStatus, targetStatus)) {
    throw new Error(`Cannot move repayment from ${repayment.status} to ${targetStatus}`);
  }

  const now = new Date();

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.repaymentConfirmation.upsert({
      where: { repaymentId: params.repaymentId },
      create: {
        repaymentId: params.repaymentId,
        customerId: params.customerId,
        signatureData: params.signatureData,
        ipAddress: params.ipAddress,
        deviceInfo: params.deviceInfo,
        status: targetStatus,
        rejectReason: params.rejectReason,
        confirmedAt: targetStatus === "CUSTOMER_CONFIRMED" ? now : null,
      },
      update: {
        customerId: params.customerId,
        signatureData: params.signatureData,
        ipAddress: params.ipAddress,
        deviceInfo: params.deviceInfo,
        status: targetStatus,
        rejectReason: params.rejectReason,
        confirmedAt: targetStatus === "CUSTOMER_CONFIRMED" ? now : null,
      },
    });

    await tx.repayment.update({
      where: { id: params.repaymentId },
      data: {
        status: targetStatus,
        matchComment:
          targetStatus === "CUSTOMER_CONFIRMED"
            ? "客户已确认付款，等待管理端确认到账"
            : params.rejectReason || "客户未确认本次还款",
      },
    });
  });

  await writeAuditLog({
    userId: params.operatorId,
    action: "repay_confirm",
    entityType: "repayment_confirmation",
    entityId: params.repaymentId,
    newValue: {
      action: params.action,
      targetStatus,
      ipAddress: params.ipAddress,
      deviceInfo: params.deviceInfo,
    },
  }).catch(() => undefined);
}

export async function settleRepaymentReceipt(params: {
  repaymentId: string;
  operatorId: string;
  action: "RECEIVED" | "NOT_RECEIVED";
  rejectReason?: string;
}) {
  const repayment = await prisma.repayment.findUnique({
    where: { id: params.repaymentId },
    include: {
      allocations: true,
      confirmation: true,
      plan: {
        include: {
          scheduleItems: true,
        },
      },
    },
  });

  if (!repayment) {
    throw new Error("Repayment not found");
  }

  const targetStatus: RepaymentStatus =
    params.action === "RECEIVED" ? "CONFIRMED" : "REJECTED";

  if (!canTransition(repayment.status as RepaymentStatus, targetStatus)) {
    throw new Error(`Cannot move repayment from ${repayment.status} to ${targetStatus}`);
  }

  const application = await prisma.loanApplication.findUnique({
    where: { id: repayment.plan.applicationId },
    include: {
      disbursement: { select: { fundAccountId: true, disbursedAt: true } },
    },
  });

  if (!application) {
    throw new Error("Loan application not found");
  }

  const now = new Date();

  if (params.action === "NOT_RECEIVED") {
    const rejected = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.repaymentConfirmation.updateMany({
        where: { repaymentId: params.repaymentId },
        data: {
          status: "REJECTED",
          rejectReason: params.rejectReason || "管理端确认未收到款项",
        },
      });

      return tx.repayment.update({
        where: { id: params.repaymentId },
        data: {
          status: "REJECTED",
          matchComment: params.rejectReason || "管理端确认未收到款项，本笔还款无效",
        },
      });
    });

    await writeAuditLog({
      userId: params.operatorId,
      action: "confirm",
      entityType: "repayment",
      entityId: params.repaymentId,
      oldValue: { status: repayment.status },
      newValue: { status: rejected.status, rejectReason: params.rejectReason || null },
      changeSummary: "管理端确认未收到该笔还款",
    }).catch(() => undefined);

    return rejected;
  }

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const received = await tx.repayment.update({
      where: { id: params.repaymentId },
      data: {
        status: "CONFIRMED",
        receivedAt: now,
        matchComment: "管理端已确认到账",
      },
    });

    await tx.repaymentConfirmation.updateMany({
      where: { repaymentId: params.repaymentId },
      data: {
        status: "CONFIRMED",
        rejectReason: null,
      },
    });

    await recordRepaymentLedger(tx, {
      repaymentId: params.repaymentId,
      principalPart: repayment.principalPart,
      interestPart: repayment.interestPart,
      feePart: repayment.feePart,
      penaltyPart: repayment.penaltyPart,
      customerId: application.customerId,
      operatorId: params.operatorId,
    });

    const allocationTotals = new Map<string, number>();
    repayment.allocations.forEach((allocation) => {
      allocationTotals.set(
        allocation.itemId,
        (allocationTotals.get(allocation.itemId) || 0) + Number(allocation.amount)
      );
    });

    const confirmedRepayments = await tx.repayment.findMany({
      where: {
        planId: repayment.planId,
        id: { not: params.repaymentId },
        status: "CONFIRMED",
      },
      select: { amount: true },
    });
    const confirmedAmountBeforeCurrent = confirmedRepayments.reduce(
      (sum, item) => sum + Number(item.amount),
      0
    );

    const singleScheduleItem = repayment.plan.scheduleItems.length === 1
      ? repayment.plan.scheduleItems[0]
      : null;
    const realtimeOutstanding = getRealtimeOutstandingAtPaymentTime({
      rulesSnapshotJson: repayment.plan.rulesSnapshotJson,
      principal: Number(application.amount),
      disbursedAt: application.disbursement?.disbursedAt,
      paymentTime: repayment.receivedAt ?? now,
    });
    const dynamicRemainingByItem = new Map<string, number>();
    if (singleScheduleItem && realtimeOutstanding != null) {
      dynamicRemainingByItem.set(
        singleScheduleItem.id,
        Math.max(0, realtimeOutstanding - confirmedAmountBeforeCurrent)
      );
    }

    let allPaid = true;

    for (const item of repayment.plan.scheduleItems) {
      const applied = allocationTotals.get(item.id) || 0;
      const currentRemaining =
        dynamicRemainingByItem.get(item.id) ?? Number(item.remaining || item.totalDue || 0);
      const nextRemaining = Math.max(0, currentRemaining - applied);
      const nextStatus =
        nextRemaining <= EPSILON
          ? "PAID"
          : item.status === "OVERDUE"
            ? "OVERDUE"
            : "PARTIAL";

      if (applied > 0) {
        await tx.repaymentScheduleItem.update({
          where: { id: item.id },
          data: {
            remaining: nextRemaining,
            status: nextStatus,
            paidAt: nextRemaining <= EPSILON ? now : item.paidAt,
          },
        });

        if (nextRemaining <= EPSILON) {
          await resolveOverdue(item.id);
        }
      }

      const projectedRemaining = applied > 0 ? nextRemaining : currentRemaining;
      if (projectedRemaining > EPSILON) {
        allPaid = false;
      }
    }

    if (allPaid) {
      await tx.repaymentPlan.update({
        where: { id: repayment.planId },
        data: { status: "COMPLETED" },
      });

      await tx.loanApplication.update({
        where: { id: application.id },
        data: { status: "SETTLED" },
      });
    }

    if (application.disbursement?.fundAccountId) {
      await tx.fundAccount.update({
        where: { id: application.disbursement.fundAccountId },
        data: {
          balance: { increment: Number(repayment.amount) },
          totalProfit: {
            increment:
              Number(repayment.interestPart) +
              Number(repayment.feePart) +
              Number(repayment.penaltyPart),
          },
        },
      });
    }

    return received;
  });

  await writeAuditLog({
    userId: params.operatorId,
    action: "confirm",
    entityType: "repayment",
    entityId: params.repaymentId,
    oldValue: { status: repayment.status },
    newValue: {
      status: updated.status,
      principalPart: Number(repayment.principalPart),
      interestPart: Number(repayment.interestPart),
      feePart: Number(repayment.feePart),
      penaltyPart: Number(repayment.penaltyPart),
    },
    changeSummary: "管理端确认该笔还款已经到账",
  }).catch(() => undefined);

  return updated;
}
