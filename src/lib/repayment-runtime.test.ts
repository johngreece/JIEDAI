import { describe, expect, it } from "vitest";
import {
  amountsMatchWithinTolerance,
  calculateLiveOutstandingFromSnapshot,
  getFrozenPayableAmount,
  getInterestFrozenAt,
  hasExplicitInterestFreeze,
  isFullPayoffAmount,
} from "@/lib/repayment-runtime";

describe("repayment interest freeze helpers", () => {
  it("prefers explicit frozen time and frozen payable amount", () => {
    const interestFrozenAt = new Date("2026-05-01T21:05:00.000Z");

    expect(getInterestFrozenAt({ interestFrozenAt })).toBe(interestFrozenAt);
    expect(getFrozenPayableAmount({ frozenPayableAmount: 1050 })).toBe(1050);
  });

  it("does not treat workflow dates or amounts as an interest freeze without explicit freeze fields", () => {
    expect(getInterestFrozenAt({})).toBeNull();
    expect(getFrozenPayableAmount({})).toBeNull();
    expect(
      hasExplicitInterestFreeze({
        status: "PENDING_CONFIRM",
        interestFrozenAt: null,
        frozenPayableAmount: null,
      })
    ).toBe(false);
  });

  it("requires an active freeze status plus explicit freeze fields", () => {
    expect(
      hasExplicitInterestFreeze({
        status: "MANUAL_REVIEW",
        interestFrozenAt: new Date("2026-05-01T21:00:00.000Z"),
        frozenPayableAmount: 1050,
      })
    ).toBe(true);
    expect(
      hasExplicitInterestFreeze({
        status: "CONFIRMED",
        interestFrozenAt: new Date("2026-05-01T21:00:00.000Z"),
        frozenPayableAmount: 1050,
      })
    ).toBe(false);
  });

  it("requires client self-service repayment to match the full payoff amount", () => {
    expect(isFullPayoffAmount(1050, 1050)).toBe(true);
    expect(isFullPayoffAmount(1050.004, 1050)).toBe(true);
    expect(isFullPayoffAmount(500, 1050)).toBe(false);
    expect(isFullPayoffAmount(1055, 1050)).toBe(false);
    expect(isFullPayoffAmount("bad", 1050)).toBe(false);
  });

  it("matches ledger allocation amounts with a small money tolerance", () => {
    expect(amountsMatchWithinTolerance(1000, "1000.00")).toBe(true);
    expect(amountsMatchWithinTolerance(1000.004, 1000)).toBe(true);
    expect(amountsMatchWithinTolerance(999.98, 1000)).toBe(false);
    expect(amountsMatchWithinTolerance(1000.02, 1000)).toBe(false);
  });

  it("uses contract principal and a deferred legal fee without adding normal interest twice", () => {
    const disbursedAt = new Date("2026-05-01T21:00:00.000Z");
    const dueDate = new Date("2026-05-08T21:00:00.000Z");
    const rulesSnapshotJson = JSON.stringify({
      channel: "FULL_AMOUNT",
      upfrontFeeRate: 0,
      tiers: [{ maxDays: 7, maxHours: 168, ratePercent: 0, label: "合同固定本金" }],
      overdueConfig: {
        graceHours: 0,
        phases: [{ startDay: 1, maxDay: null, dailyRate: 2, label: "逾期", compound: true }],
      },
      dueDate: dueDate.toISOString(),
      normalInterestCapitalized: true,
      fixedFeeAmount: 500,
      netDisbursementAmount: 10_000,
    });

    expect(calculateLiveOutstandingFromSnapshot({
      rulesSnapshotJson,
      principal: 12_000,
      disbursedAt,
      paymentTime: new Date("2026-05-07T21:00:00.000Z"),
    })).toBe(12_500);
    expect(calculateLiveOutstandingFromSnapshot({
      rulesSnapshotJson,
      principal: 12_000,
      disbursedAt,
      paymentTime: new Date("2026-05-08T21:01:00.000Z"),
    })).toBe(12_750);
  });

  it("does not apply dynamic tiers to a fixed restructure schedule", () => {
    expect(calculateLiveOutstandingFromSnapshot({
      rulesSnapshotJson: JSON.stringify({
        pricingModel: "FIXED_SCHEDULE",
        dueDate: "2026-12-31T00:00:00.000Z",
      }),
      principal: 1000,
      disbursedAt: new Date("2026-01-01T00:00:00.000Z"),
      paymentTime: new Date("2026-06-01T00:00:00.000Z"),
    })).toBeNull();
  });
});
