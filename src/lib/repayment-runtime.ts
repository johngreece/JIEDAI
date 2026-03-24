import {
  DEFAULT_OVERDUE,
  DEFAULT_TIERS,
  DEFAULT_UPFRONT_FEE_RATE,
  calculateRealtimeRepayment,
  type ChannelType,
  type OverdueConfig,
  type RepaymentTier,
} from "@/lib/interest-engine";

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
