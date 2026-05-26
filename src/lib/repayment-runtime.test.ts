import { describe, expect, it } from "vitest";
import { getFrozenPayableAmount, getInterestFrozenAt } from "@/lib/repayment-runtime";

describe("repayment interest freeze helpers", () => {
  it("prefers explicit frozen time and frozen payable amount", () => {
    const createdAt = new Date("2026-05-01T20:00:00.000Z");
    const receivedAt = new Date("2026-05-01T21:00:00.000Z");
    const interestFrozenAt = new Date("2026-05-01T21:05:00.000Z");

    expect(getInterestFrozenAt({ createdAt, receivedAt, interestFrozenAt })).toBe(interestFrozenAt);
    expect(getFrozenPayableAmount({ amount: 1020, frozenPayableAmount: 1050 })).toBe(1050);
  });

  it("falls back to legacy repayment fields when freeze fields are absent", () => {
    const createdAt = new Date("2026-05-01T20:00:00.000Z");
    const receivedAt = new Date("2026-05-01T21:00:00.000Z");

    expect(getInterestFrozenAt({ createdAt, receivedAt })).toBe(receivedAt);
    expect(getFrozenPayableAmount({ amount: "1030.50" })).toBe(1030.5);
  });
});
