import { describe, expect, it } from "vitest";

import { generateSchedule } from "@/services/schedule.service";

describe("repayment schedule generation", () => {
  it("sets a 7-day one-time loan due on the seventh day, not the first day", () => {
    const startDate = new Date(2026, 5, 1, 21, 0, 0);
    const schedule = generateSchedule({
      principal: 10000,
      termValue: 7,
      termUnit: "DAY",
      repaymentMethod: "ONE_TIME",
      annualRate: 0.365,
      feeAmount: 0,
      startDate,
    });

    expect(schedule.totalPeriods).toBe(1);
    expect(schedule.items[0].dueDate).toEqual(new Date(2026, 5, 8, 21, 0, 0));
    expect(schedule.items[0].interest.toFixed(4)).toBe("70.0000");
  });

  it("uses the full day term for long one-time loans", () => {
    const startDate = new Date(2026, 5, 1, 21, 0, 0);
    const schedule = generateSchedule({
      principal: 10000,
      termValue: 95,
      termUnit: "DAY",
      repaymentMethod: "ONE_TIME",
      annualRate: 0.365,
      feeAmount: 0,
      startDate,
    });

    expect(schedule.totalPeriods).toBe(1);
    expect(schedule.items[0].dueDate).toEqual(new Date(2026, 8, 4, 21, 0, 0));
    expect(schedule.items[0].interest.toFixed(4)).toBe("950.0000");
  });

  it("splits long day terms over the real total days", () => {
    const startDate = new Date(2026, 5, 1, 21, 0, 0);
    const schedule = generateSchedule({
      principal: 10000,
      termValue: 95,
      termUnit: "DAY",
      repaymentMethod: "EQUAL_PRINCIPAL",
      annualRate: 0,
      feeAmount: 0,
      startDate,
    });

    expect(schedule.totalPeriods).toBe(4);
    expect(schedule.items.map((item) => item.dueDate)).toEqual([
      new Date(2026, 5, 25, 21, 0, 0),
      new Date(2026, 6, 19, 21, 0, 0),
      new Date(2026, 7, 12, 21, 0, 0),
      new Date(2026, 8, 4, 21, 0, 0),
    ]);
  });

  it("prorates long day equal-principal interest by each actual period length", () => {
    const schedule = generateSchedule({
      principal: 10000,
      termValue: 95,
      termUnit: "DAY",
      repaymentMethod: "EQUAL_PRINCIPAL",
      annualRate: 0.365,
      feeAmount: 0,
      startDate: new Date(2026, 5, 1, 21, 0, 0),
    });

    expect(schedule.items.map((item) => item.interest.toFixed(4))).toEqual([
      "240.0000",
      "180.0000",
      "120.0000",
      "57.5000",
    ]);
    expect(schedule.totalInterest.toFixed(4)).toBe("597.5000");
  });

  it("charges one-time monthly interest for the full monthly term", () => {
    const schedule = generateSchedule({
      principal: 10000,
      termValue: 12,
      termUnit: "MONTH",
      repaymentMethod: "ONE_TIME",
      annualRate: 0.12,
      feeAmount: 0,
      startDate: new Date(2026, 0, 1, 21, 0, 0),
    });

    expect(schedule.items[0].dueDate).toEqual(new Date(2027, 0, 1, 21, 0, 0));
    expect(schedule.items[0].interest.toFixed(4)).toBe("1200.0000");
  });

  it("uses natural month boundaries for monthly schedules", () => {
    const schedule = generateSchedule({
      principal: 10000,
      termValue: 2,
      termUnit: "MONTH",
      repaymentMethod: "EQUAL_PRINCIPAL",
      annualRate: 0,
      feeAmount: 0,
      startDate: new Date(2026, 0, 31, 21, 0, 0),
    });

    expect(schedule.items.map((item) => item.dueDate)).toEqual([
      new Date(2026, 1, 28, 21, 0, 0),
      new Date(2026, 2, 31, 21, 0, 0),
    ]);
  });
});
