import { describe, expect, it } from "vitest";

import { applyCustomerPricingOverride, buildCustomerPricingQuote } from "@/lib/customer-pricing";

const baseConfig = {
  channel: "UPFRONT_DEDUCTION" as const,
  upfrontFeeRate: 5,
  overdueConfig: { graceHours: 0, phases: [] },
  tiers: [
    { maxDays: 0, maxHours: 5, ratePercent: 2, label: "5h", windowType: "SAME_NIGHT" as const },
    { maxDays: 1, maxHours: 24, ratePercent: 3, label: "24h", windowType: "NEXT_CALENDAR_DAY" as const },
    { maxDays: 2, maxHours: 48, ratePercent: 4, label: "48h" },
    { maxDays: 7, maxHours: 168, ratePercent: 5, label: "7d" },
  ],
};

describe("customer pricing override", () => {
  it("keeps product pricing when customer has no override", () => {
    const effective = applyCustomerPricingOverride(baseConfig, {});

    expect(effective.upfrontFeeRate).toBe(5);
    expect(effective.customerPricing.source).toBe("product_default");
    expect(effective.tiers.at(-1)?.ratePercent).toBe(5);
  });

  it("applies customer weekly override to upfront fee and weekly tier", () => {
    const effective = applyCustomerPricingOverride(baseConfig, {
      weeklyInterestRateOverride: 3.5,
    });
    const quote = buildCustomerPricingQuote(10000, effective);

    expect(effective.upfrontFeeRate).toBe(3.5);
    expect(effective.customerPricing.source).toBe("customer_override");
    expect(effective.tiers.at(-1)?.ratePercent).toBe(3.5);
    expect(effective.tiers.find((tier) => tier.windowType === "SAME_NIGHT")?.ratePercent).toBe(2);
    expect(effective.tiers.find((tier) => tier.windowType === "NEXT_CALENDAR_DAY")?.ratePercent).toBe(3);
    expect(effective.tiers.find((tier) => tier.maxHours === 48)?.ratePercent).toBe(3.5);
    expect(quote.weeklyInterestAmount).toBe("350.00");
    expect(quote.contractDisplayInterestRate).toBe("3.5%");
  });

  it("does not let a very low weekly override rewrite the same-night and next-day business windows", () => {
    const effective = applyCustomerPricingOverride(baseConfig, {
      weeklyInterestRateOverride: 1.5,
    });

    expect(effective.tiers.find((tier) => tier.windowType === "SAME_NIGHT")?.ratePercent).toBe(2);
    expect(effective.tiers.find((tier) => tier.windowType === "NEXT_CALENDAR_DAY")?.ratePercent).toBe(3);
    expect(effective.tiers.find((tier) => tier.maxHours === 48)?.ratePercent).toBe(1.5);
    expect(effective.tiers.at(-1)?.ratePercent).toBe(1.5);
  });
});
