import { describe, expect, it } from "vitest";

import {
  normalizePricingRuleCondition,
  validatePricingRuleCondition,
  validatePricingRuleType,
  validatePricingRuleValue,
} from "@/lib/pricing-rule-condition";

describe("pricing rule condition guardrails", () => {
  it("normalizes valid JSON object conditions", () => {
    const result = normalizePricingRuleCondition('{ "maxHours": 5, "windowType": "SAME_NIGHT" }');

    expect(result.error).toBeUndefined();
    expect(result.conditionJson).toBe(JSON.stringify({ maxHours: 5, windowType: "SAME_NIGHT" }));
  });

  it("rejects malformed or non-object condition JSON", () => {
    expect(normalizePricingRuleCondition("{bad-json").error).toBe("conditionJson 不是合法 JSON");
    expect(normalizePricingRuleCondition("[]").error).toBe("conditionJson 必须是 JSON 对象");
  });

  it("requires channel rules to declare the disbursement channel", () => {
    expect(validatePricingRuleCondition("CHANNEL", JSON.stringify({ type: "FULL_AMOUNT" }))).toBeNull();
    expect(validatePricingRuleCondition("CHANNEL", JSON.stringify({ type: "OTHER" }))).toContain("CHANNEL");
  });

  it("requires tier rules to declare a real repayment window", () => {
    expect(
      validatePricingRuleCondition(
        "TIER_RATE",
        JSON.stringify({ maxHours: 5, windowType: "SAME_NIGHT", nightCutoffHour: 5 })
      )
    ).toBeNull();
    expect(validatePricingRuleCondition("TIER_RATE", JSON.stringify({ maxHours: 0 }))).toContain("maxHours");
    expect(
      validatePricingRuleCondition(
        "TIER_RATE",
        JSON.stringify({ maxHours: 5, windowType: "SAME_NIGHT", nightCutoffHour: 88 })
      )
    ).toContain("nightCutoffHour");
  });

  it("requires overdue phases to have a valid day range", () => {
    expect(validatePricingRuleCondition("OVERDUE_PHASE1", JSON.stringify({ startDay: 1, maxOverdueDay: 7 }))).toBeNull();
    expect(validatePricingRuleCondition("OVERDUE_PHASE1", JSON.stringify({ startDay: 7, maxOverdueDay: 3 }))).toContain(
      "maxOverdueDay"
    );
  });

  it("rejects unknown rule types and zero-rate interest rules", () => {
    expect(validatePricingRuleType("TIER_RATE")).toBeNull();
    expect(validatePricingRuleType("MISSPELLED")).toBe("ruleType 不受支持");
    expect(validatePricingRuleValue("CHANNEL", 0)).toBeNull();
    expect(validatePricingRuleValue("OVERDUE_GRACE", 0)).toBeNull();
    expect(validatePricingRuleValue("TIER_RATE", 0)).toContain("必须大于 0");
  });
});
