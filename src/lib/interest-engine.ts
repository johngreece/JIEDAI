/**
 * 利息计算引擎 — 按自然日差费率 + 逾期简单利息
 *
 * 两种通道：
 *   UPFRONT_DEDUCTION (砍头息) — 借10000收9500，还款 = 本金 × (1 - 费率)
 *   FULL_AMOUNT       (全额)   — 借10000收10000，还款 = 本金 × (1 + 费率)
 *
 * 正常还款费率（按自然日差计算，放款日→还款日）：
 *   当天借当天还 → 2%    (还 9800 / 10200)
 *   隔天还       → 3%    (还 9700 / 10300)
 *   第3~7天还    → 5%    (还 9500 / 10500)
 *   其他天数     → 5%    (可配置)
 *
 * 逾期规则（到期后24小时宽限期后起算）：
 *   1～14天  → 每天 1%（按本金，简单利息）
 *   15天+   → 每天 2%（按本金，简单利息）
 *   逾期费 = 本金 × (天数 × 对应日费率之和)，无复利
 *
 * 费率可管理后台配置 (/settings/loan-fee)，
 * 也可在单笔借款上设置 override（仅管理员）
 */

import Decimal from "decimal.js";

/* ═══════════════════════ 类型定义 ═══════════════════════ */

/** 还款阶梯（按自然日差） */
export interface RepaymentTier {
  maxDays: number;       // 自然日差 (0 = 当天, 1 = 隔天, 7 = 第7天)
  ratePercent: number;
  label: string;
}

/** 逾期配置 */
export interface OverdueConfig {
  graceHours: number;       // 到期后宽限小时数 (24)
  phase1MaxDays: number;    // 首阶段最大天数 (14)
  phase1DailyRate: number;  // 首阶段日利率% (1)
  phase2DailyRate: number;  // 后续日利率% (2)
}

/** 通道类型 */
export type ChannelType = "UPFRONT_DEDUCTION" | "FULL_AMOUNT";

/* ═══════════════════════ 默认配置 ═══════════════════════ */

export const DEFAULT_TIERS: RepaymentTier[] = [
  { maxDays: 0, ratePercent: 2, label: "当天还" },
  { maxDays: 1, ratePercent: 3, label: "隔天还" },
  { maxDays: 7, ratePercent: 5, label: "第3~7天还" },
];

export const DEFAULT_OVERDUE: OverdueConfig = {
  graceHours: 24,
  phase1MaxDays: 14,
  phase1DailyRate: 1,
  phase2DailyRate: 2,
};

export const DEFAULT_UPFRONT_FEE_RATE = 5; // 5%

/* ═══════════════════════ 每日逾期记录 ═══════════════════════ */

export interface OverdueDayRecord {
  day: number;
  date: string;              // YYYY-MM-DD
  dailyRate: number;
  dailyInterest: number;     // principal × dailyRate%
}

/* ═══════════════════════ 计算输入/输出 ═══════════════════════ */

export interface RealtimeCalcInput {
  principal: number;
  channel: ChannelType;
  upfrontFeeRate: number;        // % (e.g. 5)
  tiers: RepaymentTier[];
  overdueConfig: OverdueConfig;
  startTime: Date;               // 放款确认时间 (disbursedAt)
  dueDate: Date;                 // 到期日
  currentTime?: Date;
}

export interface RealtimeCalcResult {
  // 基础信息
  principal: number;
  channel: ChannelType;
  netDisbursement: number;
  startTime: Date;
  currentTime: Date;
  elapsedMs: number;
  elapsedDays: number;
  elapsedFormatted: string;

  // 阶梯
  currentTier: RepaymentTier | null;
  tierIndex: number;
  tiers: RepaymentTier[];

  // 还款
  repaymentAmount: number;     // 当前应还总额（本金部分）
  feeAmount: number;           // 费用部分 = 本金 × 费率%

  // 逾期信息
  isOverdue: boolean;
  overdueDays: number;
  overduePenalty: number;      // 逾期罚息(简单利息)
  todayInterest: number;
  totalRepayment: number;      // 总应还 = repaymentAmount + overduePenalty
  dailyRecords: OverdueDayRecord[];
}

/* ═══════════════════════ 工具函数 ═══════════════════════ */

/** 格式化经过时间 */
export function formatElapsed(ms: number): string {
  if (ms < 0) return "0秒";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (mins > 0) parts.push(`${mins}分`);
  parts.push(`${secs}秒`);
  return parts.join("");
}

/**
 * 计算自然日差（放款日 → 当前日）
 * 0 = 当天, 1 = 隔天, 3 = 第3天
 */
export function daysBetween(start: Date, end: Date): number {
  const s = new Date(start);
  const e = new Date(end);
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000));
}

/** 根据自然日差找到当前阶梯 */
function findCurrentTier(
  elapsedDays: number,
  tiers: RepaymentTier[]
): { tier: RepaymentTier | null; index: number } {
  const sorted = [...tiers].sort((a, b) => a.maxDays - b.maxDays);
  for (let i = 0; i < sorted.length; i++) {
    if (elapsedDays <= sorted[i].maxDays) {
      return { tier: sorted[i], index: i };
    }
  }
  // 超过所有阶梯天数 → 使用最高阶梯费率
  if (sorted.length > 0) {
    const last = sorted[sorted.length - 1];
    return { tier: last, index: sorted.length - 1 };
  }
  return { tier: null, index: -1 };
}

/** 计算砍头息实际到手金额 */
export function calcNetDisbursement(
  principal: number,
  upfrontFeeRate: number,
  channel: ChannelType
): number {
  if (channel === "UPFRONT_DEDUCTION") {
    return new Decimal(principal)
      .mul(new Decimal(1).minus(new Decimal(upfrontFeeRate).div(100)))
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toNumber();
  }
  return principal;
}

/**
 * 计算还款金额（基于费率）
 * 砍头息: repay = principal × (1 - rate%)
 * 全额:   repay = principal × (1 + rate%)
 */
function calcTierRepayment(
  principal: number,
  ratePercent: number,
  channel: ChannelType
): number {
  const rate = new Decimal(ratePercent).div(100);
  const p = new Decimal(principal);
  if (channel === "UPFRONT_DEDUCTION") {
    return p.mul(new Decimal(1).minus(rate)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  }
  return p.mul(new Decimal(1).plus(rate)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * 计算逾期罚息（简单利息，不复利）
 * 1~14天: 每天 1%, 15天+: 每天 2%, 基于原始本金
 */
function calcOverdueSimple(
  principal: number,
  overdueDays: number,
  config: OverdueConfig,
  overdueStartDate: Date
): {
  totalPenalty: number;
  todayInterest: number;
  dailyRecords: OverdueDayRecord[];
} {
  const records: OverdueDayRecord[] = [];
  let totalPenalty = new Decimal(0);
  const p = new Decimal(principal);

  for (let d = 1; d <= overdueDays; d++) {
    const rate = d <= config.phase1MaxDays
      ? config.phase1DailyRate
      : config.phase2DailyRate;

    const dailyInterest = p.mul(rate).div(100)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    totalPenalty = totalPenalty.plus(dailyInterest);

    const dayDate = new Date(overdueStartDate);
    dayDate.setDate(dayDate.getDate() + d - 1);

    records.push({
      day: d,
      date: dayDate.toISOString().slice(0, 10),
      dailyRate: rate,
      dailyInterest: dailyInterest.toNumber(),
    });
  }

  // 当天利息预估
  const todayRate = (overdueDays + 1) <= config.phase1MaxDays
    ? config.phase1DailyRate
    : config.phase2DailyRate;
  const todayInterest = p.mul(todayRate).div(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

  return {
    totalPenalty: totalPenalty.toNumber(),
    todayInterest,
    dailyRecords: records,
  };
}

/* ═══════════════════════ 核心计算 ═══════════════════════ */

/**
 * 实时还款金额计算 — 主入口
 */
export function calculateRealtimeRepayment(
  input: RealtimeCalcInput
): RealtimeCalcResult {
  const {
    principal,
    channel,
    upfrontFeeRate,
    tiers,
    overdueConfig,
    startTime,
    dueDate,
  } = input;

  const currentTime = input.currentTime ?? new Date();
  const elapsedMs = Math.max(0, currentTime.getTime() - startTime.getTime());
  const elapsedDays = daysBetween(startTime, currentTime);

  const netDisbursement = calcNetDisbursement(principal, upfrontFeeRate, channel);

  const sortedTiers = [...tiers].sort((a, b) => a.maxDays - b.maxDays);

  const { tier: currentTier, index: tierIndex } = findCurrentTier(
    elapsedDays,
    sortedTiers
  );

  // 判断是否逾期：到期日 + 宽限期后
  const dueEnd = new Date(dueDate);
  dueEnd.setHours(23, 59, 59, 999);
  const graceMs = overdueConfig.graceHours * 60 * 60 * 1000;
  const isOverdue = currentTime.getTime() > dueEnd.getTime() + graceMs;

  // ── 正常还款期 ──
  if (!isOverdue && currentTier) {
    const repaymentAmount = calcTierRepayment(
      principal,
      currentTier.ratePercent,
      channel
    );
    const feeAmount = Math.abs(repaymentAmount - principal);

    return {
      principal,
      channel,
      netDisbursement,
      startTime,
      currentTime,
      elapsedMs,
      elapsedDays,
      elapsedFormatted: formatElapsed(elapsedMs),
      currentTier,
      tierIndex,
      tiers: sortedTiers,
      repaymentAmount,
      feeAmount,
      isOverdue: false,
      overdueDays: 0,
      overduePenalty: 0,
      todayInterest: 0,
      totalRepayment: repaymentAmount,
      dailyRecords: [],
    };
  }

  // ── 逾期期 ──
  // 逾期开始日 = 到期日 + 宽限期
  const overdueStartDate = new Date(dueEnd.getTime() + graceMs);
  const overdueDays = daysBetween(overdueStartDate, currentTime);

  const od = calcOverdueSimple(
    principal,
    overdueDays,
    overdueConfig,
    overdueStartDate
  );

  // 逾期时使用最高阶梯费率
  const maxTier = sortedTiers.length > 0
    ? sortedTiers[sortedTiers.length - 1]
    : null;
  const baseRate = maxTier ? maxTier.ratePercent : 5;
  const baseRepayment = calcTierRepayment(principal, baseRate, channel);
  const feeAmountOverdue = Math.abs(baseRepayment - principal);

  // 总应还 = 基础还款 + 逾期罚息
  const totalRepayment = new Decimal(baseRepayment)
    .plus(od.totalPenalty)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();

  return {
    principal,
    channel,
    netDisbursement,
    startTime,
    currentTime,
    elapsedMs,
    elapsedDays,
    elapsedFormatted: formatElapsed(elapsedMs),
    currentTier: maxTier,
    tierIndex: sortedTiers.length - 1,
    tiers: sortedTiers,
    repaymentAmount: baseRepayment,
    feeAmount: feeAmountOverdue,
    isOverdue: true,
    overdueDays,
    overduePenalty: od.totalPenalty,
    todayInterest: od.todayInterest,
    totalRepayment,
    dailyRecords: od.dailyRecords,
  };
}

/* ═══════════════════════ 系统设置 / PricingRules 解析 ═══════════════════════ */

/**
 * 从数据库 system_settings 或 fee_override_json 构建费率配置
 */
export function loadFeeConfig(
  systemSettings: Record<string, string | number>,
  loanOverride?: Record<string, number> | null
): {
  tiers: RepaymentTier[];
  overdueConfig: OverdueConfig;
  upfrontFeeRate: number;
  channel: ChannelType;
} {
  const get = (key: string, def: number) => {
    if (loanOverride && key in loanOverride) return Number(loanOverride[key]);
    if (key in systemSettings) return Number(systemSettings[key]);
    return def;
  };

  const sameDayRate = get("fee_same_day_rate", 2);
  const nextDayRate = get("fee_next_day_rate", 3);
  const day3Day7Rate = get("fee_day3_day7_rate", 5);
  const otherDayRate = get("fee_other_day_rate", 5);
  const upfrontFeeRate = get("fee_upfront_rate", 5);
  const graceHours = get("fee_overdue_grace_hours", 24);
  const phase1MaxDays = get("fee_overdue_phase1_max_days", 14);
  const phase1DailyRate = get("fee_overdue_rate_before_14", 1);
  const phase2DailyRate = get("fee_overdue_rate_after_14", 2);
  const channelStr = loanOverride?.channel
    ?? systemSettings["fee_channel"]
    ?? "UPFRONT_DEDUCTION";
  const channel: ChannelType =
    channelStr === "FULL_AMOUNT" ? "FULL_AMOUNT" : "UPFRONT_DEDUCTION";

  const tiers: RepaymentTier[] = [
    { maxDays: 0, ratePercent: sameDayRate, label: "当天还" },
    { maxDays: 1, ratePercent: nextDayRate, label: "隔天还" },
    { maxDays: 7, ratePercent: day3Day7Rate, label: "第3~7天还" },
  ];

  // 如果 otherDayRate 不等于 day3Day7Rate，添加一个更高的阶梯
  if (otherDayRate !== day3Day7Rate) {
    tiers.push({ maxDays: 999, ratePercent: otherDayRate, label: "其他" });
  }

  return {
    tiers,
    overdueConfig: {
      graceHours,
      phase1MaxDays,
      phase1DailyRate,
      phase2DailyRate,
    },
    upfrontFeeRate,
    channel,
  };
}

/**
 * 兼容旧版 PricingRules 解析（向后兼容）
 */
export function parseTiersFromPricingRules(
  rules: {
    ruleType: string;
    rateValue: unknown;
    conditionJson: string | null;
  }[]
): {
  tiers: RepaymentTier[];
  overdueConfig: OverdueConfig;
  upfrontFeeRate: number;
  channel: ChannelType;
} {
  const tiers: RepaymentTier[] = [];
  let upfrontFeeRate = DEFAULT_UPFRONT_FEE_RATE;
  let channel: ChannelType = "UPFRONT_DEDUCTION";
  const overdueConfig: OverdueConfig = { ...DEFAULT_OVERDUE };

  for (const rule of rules) {
    const cond = rule.conditionJson
      ? (JSON.parse(rule.conditionJson) as Record<string, unknown>)
      : {};
    const val = Number(rule.rateValue);

    switch (rule.ruleType) {
      case "TIER_RATE": {
        // 支持 maxDays（新）或 maxHours（旧）
        const maxDays = (cond.maxDays as number)
          ?? Math.round(((cond.maxHours as number) ?? 168) / 24);
        tiers.push({
          maxDays,
          ratePercent: val,
          label: (cond.label as string) ?? `第${maxDays}天`,
        });
        break;
      }
      case "UPFRONT_FEE":
        upfrontFeeRate = val;
        break;
      case "CHANNEL":
        channel = (cond.type as ChannelType) ?? "UPFRONT_DEDUCTION";
        break;
      case "OVERDUE_PHASE1":
        overdueConfig.phase1MaxDays = (cond.maxDays as number)
          ?? Math.round(((cond.maxHours as number) ?? 336) / 24);
        overdueConfig.phase1DailyRate = val;
        break;
      case "OVERDUE_PHASE2":
        overdueConfig.phase2DailyRate = val;
        break;
    }
  }

  return {
    tiers: tiers.length > 0 ? tiers : [...DEFAULT_TIERS],
    overdueConfig,
    upfrontFeeRate,
    channel,
  };
}
