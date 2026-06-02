import {
  DEFAULT_OVERDUE,
  DEFAULT_TIERS,
  DEFAULT_UPFRONT_FEE_RATE,
  calculateRealtimeRepayment,
  type ChannelType,
  type OverdueConfig,
  type RepaymentTier,
} from "@/lib/interest-engine";

export const INTEREST_FREEZE_REPAYMENT_STATUSES = [
  "MANUAL_REVIEW",
  "PENDING_CONFIRM",
  "CUSTOMER_CONFIRMED",
] as const;

export function getInterestFrozenAt(repayment: {
  interestFrozenAt?: Date | null;
} | null | undefined): Date | null {
  if (!repayment) return null;
  return repayment.interestFrozenAt ?? null;
}

export function getFrozenPayableAmount(repayment: {
  frozenPayableAmount?: unknown | null;
} | null | undefined): number | null {
  if (!repayment) return null;
  if (repayment.frozenPayableAmount == null) return null;
  const value = repayment.frozenPayableAmount;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export function hasExplicitInterestFreeze(repayment: {
  status?: string | null;
  interestFrozenAt?: Date | null;
  frozenPayableAmount?: unknown | null;
} | null | undefined): boolean {
  if (!repayment) return false;
  if (!(INTEREST_FREEZE_REPAYMENT_STATUSES as readonly string[]).includes(repayment.status ?? "")) return false;
  return repayment.interestFrozenAt != null && getFrozenPayableAmount(repayment) != null;
}

export function amountsMatchWithinTolerance(left: unknown, right: unknown, tolerance = 0.01): boolean {
  const leftAmount = Number(left);
  const rightAmount = Number(right);
  const safeTolerance = Math.max(0, tolerance);

  if (!Number.isFinite(leftAmount) || !Number.isFinite(rightAmount)) return false;
  return Math.abs(leftAmount - rightAmount) <= safeTolerance;
}

export function isFullPayoffAmount(
  submittedAmount: unknown,
  outstandingAmount: unknown,
  tolerance = 0.01
): boolean {
  const submitted = Number(submittedAmount);
  const outstanding = Number(outstandingAmount);

  if (!Number.isFinite(submitted) || !Number.isFinite(outstanding)) return false;
  if (submitted <= 0 || outstanding <= 0) return false;

  return amountsMatchWithinTolerance(submitted, outstanding, tolerance);
}

export function extractPaidDates(detail: string | null | undefined): string[] {
  if (!detail) return [];

  try {
    const parsed = JSON.parse(detail) as { paidDates?: string[] };
    return parsed.paidDates ?? [];
  } catch {
    return [];
  }
}

export function calculateLiveOutstandingFromSnapshot(params: {
  rulesSnapshotJson: string | null;
  principal: number;
  disbursedAt: Date | null | undefined;
  paymentTime: Date;
  paidDates?: string[];
}): number | null {
  const { rulesSnapshotJson, principal, disbursedAt, paymentTime, paidDates } = params;
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
      paidDates,
    });

    return realtime.totalRepayment;
  } catch {
    return null;
  }
}
