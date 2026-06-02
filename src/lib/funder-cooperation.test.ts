import { describe, expect, it } from "vitest";

import {
  describeFunderRate,
  describeFunderRule,
  getFunderCycleDays,
  getFunderCycleLabel,
  getFunderDisplayRate,
  resolveFunderRuleMode,
} from "@/lib/funder-cooperation";

describe("funder cooperation rules", () => {
  it("describes fixed monthly funders with monthly rate", () => {
    const rule = { cooperationMode: "FIXED_MONTHLY", monthlyRate: 1 };

    expect(resolveFunderRuleMode(rule)).toBe("FIXED_MONTHLY");
    expect(getFunderCycleDays(rule)).toBeNull();
    expect(getFunderCycleLabel(rule)).toBe("自然月");
    expect(describeFunderRate(rule)).toBe("1% / 月");
    expect(describeFunderRule(rule).rateText).toBe("月利率 1%");
    expect(describeFunderRule(rule).formula).toContain("2月按28/29天");
  });

  it("describes fixed weekly funders with weekly rate", () => {
    const rule = { cooperationMode: "VOLUME_BASED", weeklyRate: 1.5, profitShareRatio: 0 };

    expect(resolveFunderRuleMode(rule)).toBe("VOLUME_BASED");
    expect(getFunderCycleDays(rule)).toBe(7);
    expect(describeFunderRate(rule)).toBe("1.5% / 7天");
    expect(describeFunderRule(rule).rateText).toBe("周利率 1.5%");
  });

  it("displays profit share ratios as human percentages", () => {
    const rule = { cooperationMode: "PROFIT_SHARE", profitShareRatio: 0.3 };

    expect(resolveFunderRuleMode(rule)).toBe("PROFIT_SHARE");
    expect(getFunderCycleDays(rule)).toBe(7);
    expect(getFunderDisplayRate(rule)).toBe(30);
    expect(describeFunderRate(rule)).toBe("30% / 实际收益");
    expect(describeFunderRule(rule).rateText).toBe("分润比例 30%");
  });

  it("keeps legacy volume records with a profit ratio readable as profit share", () => {
    const rule = { cooperationMode: "VOLUME_BASED", weeklyRate: 1.5, profitShareRatio: 0.25 };

    expect(resolveFunderRuleMode(rule)).toBe("PROFIT_SHARE");
    expect(describeFunderRate(rule)).toBe("25% / 实际收益");
  });
});
