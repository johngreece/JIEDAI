export const FUNDER_COOPERATION_MODES = [
  "FIXED_MONTHLY",
  "VOLUME_BASED",
  "PROFIT_SHARE",
] as const;

export type FunderCooperationMode = (typeof FUNDER_COOPERATION_MODES)[number];

export type FunderRateSnapshot = {
  cooperationMode?: string | null;
  monthlyRate?: number | string | null;
  weeklyRate?: number | string | null;
  profitShareRatio?: number | string | null;
};

export const FUNDER_COOPERATION_LABELS: Record<FunderCooperationMode, string> = {
  FIXED_MONTHLY: "固定月息",
  VOLUME_BASED: "固定周息",
  PROFIT_SHARE: "按实际收益分润",
};

export const FUNDER_COOPERATION_OPTIONS = FUNDER_COOPERATION_MODES.map((value) => ({
  value,
  label: FUNDER_COOPERATION_LABELS[value],
}));

function toNumber(value: unknown) {
  return Number(value || 0);
}

function formatRate(value: number, digits = 2) {
  const rounded = Number(value.toFixed(digits));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function normalizeFunderCooperationMode(mode?: string | null): FunderCooperationMode {
  return FUNDER_COOPERATION_MODES.includes(mode as FunderCooperationMode)
    ? (mode as FunderCooperationMode)
    : "FIXED_MONTHLY";
}

export function isProfitShareFunder(input: FunderRateSnapshot) {
  const mode = normalizeFunderCooperationMode(input.cooperationMode);
  return mode === "PROFIT_SHARE" || (mode !== "FIXED_MONTHLY" && toNumber(input.profitShareRatio) > 0);
}

export function resolveFunderRuleMode(input: FunderRateSnapshot): FunderCooperationMode {
  const mode = normalizeFunderCooperationMode(input.cooperationMode);
  if (mode === "FIXED_MONTHLY") return "FIXED_MONTHLY";
  return isProfitShareFunder(input) ? "PROFIT_SHARE" : "VOLUME_BASED";
}

export function getFunderCycleDays(input: FunderRateSnapshot) {
  return resolveFunderRuleMode(input) === "FIXED_MONTHLY" ? null : 7;
}

export function getFunderCycleLabel(input: FunderRateSnapshot) {
  return resolveFunderRuleMode(input) === "FIXED_MONTHLY" ? "自然月" : "7天";
}

export function getFunderCalculationRate(input: FunderRateSnapshot) {
  const ruleMode = resolveFunderRuleMode(input);
  if (ruleMode === "FIXED_MONTHLY") return toNumber(input.monthlyRate);
  if (ruleMode === "PROFIT_SHARE") return toNumber(input.profitShareRatio);
  return toNumber(input.weeklyRate);
}

export function getFunderDisplayRate(input: FunderRateSnapshot) {
  const ruleMode = resolveFunderRuleMode(input);
  const rate = getFunderCalculationRate(input);
  return ruleMode === "PROFIT_SHARE" ? rate * 100 : rate;
}

export function describeFunderRate(input: FunderRateSnapshot) {
  const ruleMode = resolveFunderRuleMode(input);
  if (ruleMode === "FIXED_MONTHLY") {
    return `${formatRate(toNumber(input.monthlyRate))}% / 月`;
  }
  if (ruleMode === "PROFIT_SHARE") {
    return `${formatRate(toNumber(input.profitShareRatio) * 100)}% / 实际收益`;
  }
  return `${formatRate(toNumber(input.weeklyRate))}% / 7天`;
}

export function describeFunderRule(input: FunderRateSnapshot) {
  const ruleMode = resolveFunderRuleMode(input);
  const label = FUNDER_COOPERATION_LABELS[ruleMode];

  if (ruleMode === "FIXED_MONTHLY") {
    return {
      mode: ruleMode,
      title: label,
      rateText: `月利率 ${formatRate(toNumber(input.monthlyRate))}%`,
      formula: `按实际放款本金 × 月利率 ${formatRate(toNumber(input.monthlyRate))}% 计算，每满一个自然月形成一笔利息；2月按28/29天，30天月按30天，31天月按31天。`,
      settlement: "本金可按账户余额申请提现，利息在满自然月周期后生成收益结算单；提前结清的零头按所在自然月实际天数折算。",
    };
  }

  if (ruleMode === "PROFIT_SHARE") {
    return {
      mode: ruleMode,
      title: label,
      rateText: `分润比例 ${formatRate(toNumber(input.profitShareRatio) * 100)}%`,
      formula: `按客户已确认回款中的利息、费用和罚息 × 分润比例 ${formatRate(toNumber(input.profitShareRatio) * 100)}% 计算。`,
      settlement: "实际收益进入结算单后，平台登记打款，资金方在资金端确认到账；未收到可反馈给管理端继续核对。",
    };
  }

  return {
    mode: ruleMode,
    title: label,
    rateText: `周利率 ${formatRate(toNumber(input.weeklyRate))}%`,
    formula: `按实际放款本金 × 周利率 ${formatRate(toNumber(input.weeklyRate))}% 计算，每满 7 天形成一笔利息。`,
    settlement: "未放出的闲置资金不计息；已放出资金按 7 天周期生成收益结算单，平台打款后由资金方确认到账。",
  };
}
