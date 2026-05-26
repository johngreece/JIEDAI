export type PricingRuleWindowType = "ELAPSED_HOURS" | "SAME_NIGHT" | "NEXT_CALENDAR_DAY";

export const PRICING_RULE_TYPES = new Set([
  "UPFRONT_FEE",
  "CHANNEL",
  "TIER_RATE",
  "OVERDUE_GRACE",
]);

export const PRICING_RULE_WINDOW_TYPES = new Set<PricingRuleWindowType>([
  "ELAPSED_HOURS",
  "SAME_NIGHT",
  "NEXT_CALENDAR_DAY",
]);

export const PRICING_RULE_CHANNELS = new Set(["FULL_AMOUNT", "UPFRONT_DEDUCTION"]);

export type PricingRuleCondition = Record<string, unknown>;

export function isSupportedPricingRuleType(ruleType: string) {
  return PRICING_RULE_TYPES.has(ruleType) || ruleType.startsWith("OVERDUE_PHASE");
}

export function parsePricingRuleCondition(raw: string | null | undefined): PricingRuleCondition {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as PricingRuleCondition)
      : {};
  } catch {
    return {};
  }
}

export function normalizePricingRuleCondition(
  raw: string | null | undefined
): { conditionJson?: string | null; condition: PricingRuleCondition; error?: string } {
  if (raw === undefined) return { conditionJson: undefined, condition: {} };
  if (raw === null || raw.trim() === "") return { conditionJson: null, condition: {} };

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { condition: {}, error: "conditionJson 必须是 JSON 对象" };
    }
    return { conditionJson: JSON.stringify(parsed), condition: parsed as PricingRuleCondition };
  } catch {
    return { condition: {}, error: "conditionJson 不是合法 JSON" };
  }
}

export function validatePricingRuleType(ruleType: string): string | null {
  if (!isSupportedPricingRuleType(ruleType)) {
    return "ruleType 不受支持";
  }
  return null;
}

export function validatePricingRuleValue(ruleType: string, rateValue: unknown): string | null {
  const value = Number(rateValue);
  if (!Number.isFinite(value) || value < 0) {
    return "rateValue 必须是非负数字";
  }
  if (ruleType !== "CHANNEL" && ruleType !== "OVERDUE_GRACE" && value <= 0) {
    return `${ruleType} 的 rateValue 必须大于 0`;
  }
  return null;
}

export function validatePricingRuleCondition(
  ruleType: string,
  conditionJson: string | null | undefined
): string | null {
  const cond = parsePricingRuleCondition(conditionJson);

  if (ruleType === "CHANNEL") {
    if (!PRICING_RULE_CHANNELS.has(String(cond.type))) {
      return "CHANNEL 规则必须配置 type=FULL_AMOUNT 或 UPFRONT_DEDUCTION";
    }
    return null;
  }

  if (ruleType === "TIER_RATE") {
    const maxHours = Number(cond.maxHours ?? 0);
    const maxDays = Number(cond.maxDays ?? 0);
    const hasValidMaxHours = Number.isFinite(maxHours) && maxHours > 0;
    const hasValidMaxDays = Number.isFinite(maxDays) && maxDays > 0;
    if (!hasValidMaxHours && !hasValidMaxDays) {
      return "TIER_RATE 规则必须配置有效的 maxHours 或 maxDays";
    }
    if (cond.windowType != null && !PRICING_RULE_WINDOW_TYPES.has(String(cond.windowType) as PricingRuleWindowType)) {
      return "windowType 只能是 ELAPSED_HOURS、SAME_NIGHT 或 NEXT_CALENDAR_DAY";
    }
    if (cond.windowType === "SAME_NIGHT") {
      const cutoff = Number(cond.nightCutoffHour ?? 5);
      if (!Number.isInteger(cutoff) || cutoff < 0 || cutoff > 23) {
        return "SAME_NIGHT 的 nightCutoffHour 必须是 0-23 的整数";
      }
    }
  }

  if (ruleType.startsWith("OVERDUE_PHASE")) {
    const startDay = Number(cond.startDay ?? 1);
    const maxDay = cond.maxOverdueDay ?? cond.maxDays;
    if (!Number.isInteger(startDay) || startDay <= 0) {
      return "OVERDUE_PHASE 的 startDay 必须是正整数";
    }
    if (maxDay != null && maxDay !== "" && (!Number.isInteger(Number(maxDay)) || Number(maxDay) < startDay)) {
      return "OVERDUE_PHASE 的 maxOverdueDay 必须为空或不小于 startDay";
    }
  }

  return null;
}
