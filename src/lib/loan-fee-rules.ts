/**
 * 借款还款费率规则（固定规则 + 管理员可调）
 * - 放款后5小时内还 2%；放款后24小时内还 3%；超过24小时到7天内还 5%
 * - 逾期：到期后24小时宽限；超过后按天 1%/天；超过14天 2%/天
 */

export type FeeRates = {
  /** 放款后 5 小时内还款费率（如 2 表示 2%） */
  sameDayRate: number;
  /** 放款后 24 小时内还款费率（如 3 表示 3%） */
  nextDayRate: number;
  /** 超过 24 小时至 7 天内还款费率（如 5 表示 5%） */
  day3Day7Rate: number;
  /** 其他天数默认费率（如 5） */
  otherDayRate: number;
  /** 逾期宽限小时数（24 小时内算当天） */
  overdueGraceHours: number;
  /** 逾期 14 天内每日费率（% 每天） */
  overdueRatePerDayBefore14: number;
  /** 逾期 14 天以上每日费率（% 每天） */
  overdueRatePerDayAfter14: number;
};

export const DEFAULT_FEE_RATES: FeeRates = {
  sameDayRate: 2,
  nextDayRate: 3,
  day3Day7Rate: 5,
  otherDayRate: 5,
  overdueGraceHours: 24,
  overdueRatePerDayBefore14: 1,
  overdueRatePerDayAfter14: 2,
};

export type FeeOverride = {
  sameDayRate?: number;
  nextDayRate?: number;
  day3Day7Rate?: number;
  otherDayRate?: number;
};

/** 系统配置 key（与 system_settings 一致） */
export const FEE_SETTING_KEYS = {
  sameDayRate: "loan_fee_same_day_rate",
  nextDayRate: "loan_fee_next_day_rate",
  day3Day7Rate: "loan_fee_day3_day7_rate",
  otherDayRate: "loan_fee_other_day_rate",
  overdueGraceHours: "loan_overdue_grace_hours",
  overdueRateBefore14: "loan_overdue_rate_per_day_before_14",
  overdueRateAfter14: "loan_overdue_rate_per_day_after_14",
} as const;

/**
 * 合并默认 + 系统配置 + 借款单 override（仅管理员可写 override）
 */
export function mergeRates(
  systemRates: Partial<FeeRates> | null,
  loanOverride: FeeOverride | null
): FeeRates {
  const base = { ...DEFAULT_FEE_RATES, ...systemRates };
  return {
    ...base,
    ...(loanOverride && {
      ...(loanOverride.sameDayRate != null && { sameDayRate: loanOverride.sameDayRate }),
      ...(loanOverride.nextDayRate != null && { nextDayRate: loanOverride.nextDayRate }),
      ...(loanOverride.day3Day7Rate != null && { day3Day7Rate: loanOverride.day3Day7Rate }),
      ...(loanOverride.otherDayRate != null && { otherDayRate: loanOverride.otherDayRate }),
    }),
  };
}

/**
 * 计算还款时间与放款时间的间隔小时数
 */
export function elapsedHoursBetween(disbursedAt: Date, repaidAt: Date): number {
  return Math.max(0, (repaidAt.getTime() - disbursedAt.getTime()) / 3600000);
}

/**
 * 是否在宽限小时内
 */
export function isSameDayByHours(disbursedAt: Date, repaidAt: Date, graceHours: number): boolean {
  const ms = repaidAt.getTime() - disbursedAt.getTime();
  return ms >= 0 && ms <= graceHours * 60 * 60 * 1000;
}

/**
 * 根据放款时间、还款时间、到期日，判断是正常还款还是逾期，并返回应使用的费率（%）
 * - 若 repaidAt 在 dueDate 的 graceHours 内：按“5小时/24小时/7天内”规则
 * - 若超过 dueDate + graceHours：按逾期规则（1%/天 或 14 天后 2%/天）
 */
export function getRepaymentFeeRate(
  disbursedAt: Date,
  dueDate: Date,
  repaidAt: Date,
  rates: FeeRates
): { ratePercent: number; isOverdue: boolean; overdueDays: number } {
  const repaid = new Date(repaidAt);
  const dueEndMs = new Date(dueDate).getTime();
  const graceMs = rates.overdueGraceHours * 60 * 60 * 1000;

  if (repaid.getTime() <= dueEndMs + graceMs) {
    const elapsedHours = elapsedHoursBetween(disbursedAt, repaidAt);
    let rate = rates.otherDayRate;
    if (elapsedHours <= 5) rate = rates.sameDayRate;
    else if (elapsedHours <= 24) rate = rates.nextDayRate;
    else if (elapsedHours <= 7 * 24) rate = rates.day3Day7Rate;
    return { ratePercent: rate, isOverdue: false, overdueDays: 0 };
  }

  const overdueStart = new Date(dueEndMs + graceMs);
  const overdueDays = Math.ceil((repaid.getTime() - overdueStart.getTime()) / 86400000);
  const daysForRateBefore14 = Math.min(overdueDays, 14);
  const daysForRateAfter14 = Math.max(0, overdueDays - 14);
  const totalOverduePercent =
    daysForRateBefore14 * rates.overdueRatePerDayBefore14 +
    daysForRateAfter14 * rates.overdueRatePerDayAfter14;
  return { ratePercent: totalOverduePercent, isOverdue: true, overdueDays };
}

/**
 * 计算应还费用（本金 * 费率% / 100）
 */
export function calcFeeAmount(principal: number, ratePercent: number): number {
  return Math.round(principal * (ratePercent / 100) * 100) / 100;
}
