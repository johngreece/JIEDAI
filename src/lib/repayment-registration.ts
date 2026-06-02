export const REPAYMENT_REGISTRATION_BLOCKING_STATUSES = [
  "PENDING",
  "MATCHED",
  "MANUAL_REVIEW",
  "PENDING_CONFIRM",
  "CUSTOMER_CONFIRMED",
] as const;

export const OPEN_REPAYMENT_SCHEDULE_STATUSES = [
  "PENDING",
  "PARTIAL",
  "OVERDUE",
] as const;

export type RepaymentScheduleOutstandingItem = {
  status?: string | null;
  remaining?: unknown;
};

export function isOpenRepaymentScheduleStatus(status: string | null | undefined) {
  return (OPEN_REPAYMENT_SCHEDULE_STATUSES as readonly string[]).includes(status ?? "");
}

export function calculateRepaymentRegistrationOutstanding(
  items: RepaymentScheduleOutstandingItem[]
) {
  return items.reduce((sum, item) => {
    if (!isOpenRepaymentScheduleStatus(item.status)) return sum;
    const remaining = Number(item.remaining);
    if (!Number.isFinite(remaining) || remaining <= 0) return sum;
    return sum + remaining;
  }, 0);
}

export function isRepaymentAmountWithinRegistrationOutstanding(
  amount: unknown,
  outstanding: unknown,
  tolerance = 0.01
) {
  const submitted = Number(amount);
  const available = Number(outstanding);
  const safeTolerance = Math.max(0, tolerance);

  if (!Number.isFinite(submitted) || !Number.isFinite(available)) return false;
  if (submitted <= 0 || available <= 0) return false;

  return submitted - available <= safeTolerance;
}

