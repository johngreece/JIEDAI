import { describe, expect, it } from "vitest";

import {
  calculateRepaymentRegistrationOutstanding,
  isOpenRepaymentScheduleStatus,
  isRepaymentAmountWithinRegistrationOutstanding,
} from "@/lib/repayment-registration";

describe("repayment registration outstanding rules", () => {
  it("sums only open positive schedule remaining amounts", () => {
    expect(
      calculateRepaymentRegistrationOutstanding([
        { status: "PENDING", remaining: 100 },
        { status: "PARTIAL", remaining: "20.50" },
        { status: "OVERDUE", remaining: 30 },
        { status: "PAID", remaining: 999 },
        { status: "PENDING", remaining: -10 },
      ])
    ).toBe(150.5);
  });

  it("recognizes only statuses that can still accept repayment", () => {
    expect(isOpenRepaymentScheduleStatus("PENDING")).toBe(true);
    expect(isOpenRepaymentScheduleStatus("PARTIAL")).toBe(true);
    expect(isOpenRepaymentScheduleStatus("OVERDUE")).toBe(true);
    expect(isOpenRepaymentScheduleStatus("PAID")).toBe(false);
  });

  it("allows tiny money rounding tolerance but rejects real overpayment", () => {
    expect(isRepaymentAmountWithinRegistrationOutstanding(100.004, 100)).toBe(true);
    expect(isRepaymentAmountWithinRegistrationOutstanding(100.02, 100)).toBe(false);
    expect(isRepaymentAmountWithinRegistrationOutstanding(0, 100)).toBe(false);
    expect(isRepaymentAmountWithinRegistrationOutstanding(100, 0)).toBe(false);
  });
});

