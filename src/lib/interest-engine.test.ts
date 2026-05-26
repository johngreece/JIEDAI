import { describe, expect, it } from "vitest";

import {
  calculateRealtimeRepayment,
  DEFAULT_OVERDUE,
  DEFAULT_TIERS,
  loadFeeConfig,
  parseTiersFromPricingRules,
} from "@/lib/interest-engine";

const DAY_MS = 24 * 60 * 60 * 1000;

function calcAt(currentTime: Date) {
  const startTime = new Date(2026, 4, 1, 21, 0, 0);

  return calculateRealtimeRepayment({
    principal: 10000,
    channel: "FULL_AMOUNT",
    upfrontFeeRate: 5,
    tiers: DEFAULT_TIERS,
    overdueConfig: DEFAULT_OVERDUE,
    startTime,
    dueDate: new Date(startTime.getTime() + 7 * DAY_MS),
    currentTime,
  });
}

describe("interest engine business windows", () => {
  it("charges 2% for same-night repayment including early next morning", () => {
    const result = calcAt(new Date(2026, 4, 2, 4, 0, 0));

    expect(result.isOverdue).toBe(false);
    expect(result.currentTier?.ratePercent).toBe(2);
    expect(result.totalRepayment).toBe(10200);
  });

  it("charges 3% for repayment on the next afternoon or night", () => {
    const result = calcAt(new Date(2026, 4, 2, 20, 0, 0));

    expect(result.isOverdue).toBe(false);
    expect(result.currentTier?.ratePercent).toBe(3);
    expect(result.totalRepayment).toBe(10300);
  });

  it("keeps the weekly rate until the seventh-day same-time deadline", () => {
    const result = calcAt(new Date(2026, 4, 8, 20, 59, 0));

    expect(result.isOverdue).toBe(false);
    expect(result.currentTier?.ratePercent).toBe(5);
    expect(result.totalRepayment).toBe(10500);
  });

  it("marks the loan overdue after the seventh-day same-time deadline and adds 2%", () => {
    const result = calcAt(new Date(2026, 4, 8, 21, 1, 0));

    expect(result.isOverdue).toBe(true);
    expect(result.overdueDays).toBe(1);
    expect(result.repaymentAmount).toBe(10500);
    expect(result.overduePenalty).toBe(210);
    expect(result.totalRepayment).toBe(10710);
  });

  it("loads the normal business defaults from system settings", () => {
    const config = loadFeeConfig({}, null);

    expect(config.tiers.at(0)?.windowType).toBe("SAME_NIGHT");
    expect(config.tiers.at(1)?.windowType).toBe("NEXT_CALENDAR_DAY");
    expect(config.tiers.at(-1)?.ratePercent).toBe(5);
    expect(config.overdueConfig.phases.at(0)?.dailyRate).toBe(2);
  });

  it("infers business windows from legacy pricing rules", () => {
    const config = parseTiersFromPricingRules([
      { ruleType: "TIER_RATE", rateValue: 2, conditionJson: JSON.stringify({ maxHours: 5, maxDays: 0 }) },
      { ruleType: "TIER_RATE", rateValue: 3, conditionJson: JSON.stringify({ maxHours: 24, maxDays: 1 }) },
      { ruleType: "TIER_RATE", rateValue: 5, conditionJson: JSON.stringify({ maxHours: 168, maxDays: 7 }) },
    ]);

    expect(config.tiers.at(0)?.windowType).toBe("SAME_NIGHT");
    expect(config.tiers.at(1)?.windowType).toBe("NEXT_CALENDAR_DAY");
    expect(config.tiers.at(-1)?.ratePercent).toBe(5);
  });

  it("does not crash when a pricing rule has malformed condition JSON", () => {
    const config = parseTiersFromPricingRules([
      { ruleType: "TIER_RATE", rateValue: 5, conditionJson: "{bad-json" },
      { ruleType: "CHANNEL", rateValue: 0, conditionJson: "[]" },
    ]);

    expect(config.channel).toBe("FULL_AMOUNT");
    expect(config.tiers.at(0)?.maxHours).toBe(168);
    expect(config.tiers.at(0)?.ratePercent).toBe(5);
  });
});
