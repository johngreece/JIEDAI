import Decimal from "decimal.js";

export interface RepaymentTier {
  maxDays: number;
  maxHours?: number;
  ratePercent: number;
  label: string;
}

export interface OverduePhase {
  startDay: number;
  maxDay: number | null;
  dailyRate: number;
  label: string;
  compound: boolean;
}

export interface OverdueConfig {
  graceHours: number;
  phases: OverduePhase[];
}

export type ChannelType = "UPFRONT_DEDUCTION" | "FULL_AMOUNT";

export const DEFAULT_TIERS: RepaymentTier[] = [
  { maxDays: 0, maxHours: 5, ratePercent: 2, label: "5小时内还" },
  { maxDays: 1, maxHours: 24, ratePercent: 3, label: "24小时内还" },
  { maxDays: 2, maxHours: 48, ratePercent: 4, label: "48小时内还" },
  { maxDays: 7, maxHours: 7 * 24, ratePercent: 6, label: "48小时后至7天内还" },
];

export const DEFAULT_OVERDUE: OverdueConfig = {
  graceHours: 0,
  phases: [
    { startDay: 1, maxDay: 7, dailyRate: 1, label: "逾期第1-7天", compound: true },
    { startDay: 8, maxDay: 30, dailyRate: 2, label: "逾期第8-30天", compound: true },
    { startDay: 31, maxDay: null, dailyRate: 3, label: "逾期第31天起", compound: true },
  ],
};

export const DEFAULT_UPFRONT_FEE_RATE = 5;

export interface OverdueDayRecord {
  day: number;
  date: string;
  dailyRate: number;
  dailyInterest: number;
  principalAtStart: number;
  principalAtEnd: number;
  capitalizedAmount: number;
  paid: boolean;
}

export interface RealtimeCalcInput {
  principal: number;
  channel: ChannelType;
  upfrontFeeRate: number;
  tiers: RepaymentTier[];
  overdueConfig: OverdueConfig;
  startTime: Date;
  dueDate: Date;
  currentTime?: Date;
  paidDates?: string[];
}

export interface RealtimeCalcResult {
  principal: number;
  channel: ChannelType;
  netDisbursement: number;
  startTime: Date;
  currentTime: Date;
  elapsedMs: number;
  elapsedDays: number;
  elapsedFormatted: string;
  currentTier: RepaymentTier | null;
  tierIndex: number;
  tiers: RepaymentTier[];
  repaymentAmount: number;
  feeAmount: number;
  isOverdue: boolean;
  overdueDays: number;
  overduePenalty: number;
  todayInterest: number;
  totalRepayment: number;
  dailyRecords: OverdueDayRecord[];
}

export interface OverdueBreakdown {
  outstandingPenalty: number;
  totalOutstanding: number;
  todayInterest: number;
  dailyRecords: OverdueDayRecord[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function roundMoney(value: Decimal.Value): number {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

function getTierHours(tier: RepaymentTier): number {
  return tier.maxHours ?? tier.maxDays * 24;
}

function sortTiers(tiers: RepaymentTier[]): RepaymentTier[] {
  return [...tiers].sort((a, b) => getTierHours(a) - getTierHours(b));
}

function sortOverduePhases(phases: OverduePhase[]): OverduePhase[] {
  return [...phases].sort((a, b) => a.startDay - b.startDay);
}

function getOverduePhase(day: number, config: OverdueConfig): OverduePhase {
  const sorted = sortOverduePhases(config.phases);
  const matched = sorted.find((phase) => day >= phase.startDay && (phase.maxDay == null || day <= phase.maxDay));
  return matched ?? sorted[sorted.length - 1];
}

function parseNumericValue(raw: string | number | undefined, fallback: number): number {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : fallback;
  }
  if (typeof raw === "string") {
    const direct = Number(raw);
    if (!Number.isNaN(direct)) return direct;
    try {
      const parsed = JSON.parse(raw) as { value?: unknown };
      const nested = Number(parsed?.value);
      if (!Number.isNaN(nested)) return nested;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

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

export function daysBetween(start: Date, end: Date): number {
  const s = new Date(start);
  const e = new Date(end);
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / DAY_MS));
}

function findCurrentTier(elapsedMs: number, tiers: RepaymentTier[]): { tier: RepaymentTier | null; index: number } {
  const sorted = sortTiers(tiers);
  for (let i = 0; i < sorted.length; i += 1) {
    if (elapsedMs <= getTierHours(sorted[i]) * HOUR_MS) {
      return { tier: sorted[i], index: i };
    }
  }
  if (sorted.length === 0) return { tier: null, index: -1 };
  return { tier: sorted[sorted.length - 1], index: sorted.length - 1 };
}

export function calcNetDisbursement(
  principal: number,
  upfrontFeeRate: number,
  channel: ChannelType
): number {
  if (channel !== "UPFRONT_DEDUCTION") return roundMoney(principal);
  return roundMoney(new Decimal(principal).mul(new Decimal(1).minus(new Decimal(upfrontFeeRate).div(100))));
}

export function calcRepaymentAmount(
  principal: number,
  ratePercent: number,
  channel: ChannelType
): number {
  if (channel === "UPFRONT_DEDUCTION") {
    return roundMoney(principal);
  }
  return roundMoney(new Decimal(principal).mul(new Decimal(1).plus(new Decimal(ratePercent).div(100))));
}

export function calculateOverdueBreakdown(input: {
  baseAmount: number;
  overdueDays: number;
  overdueConfig: OverdueConfig;
  overdueStartDate: Date;
  paidDates?: string[];
}): OverdueBreakdown {
  const { baseAmount, overdueDays, overdueConfig, overdueStartDate } = input;
  const paidDates = new Set(input.paidDates ?? []);
  const dailyRecords: OverdueDayRecord[] = [];
  let runningPrincipal = new Decimal(baseAmount);

  for (let day = 1; day <= overdueDays; day += 1) {
    const phase = getOverduePhase(day, overdueConfig);
    const currentDate = new Date(overdueStartDate.getTime() + (day - 1) * DAY_MS);
    const dateKey = currentDate.toISOString().slice(0, 10);
    const principalAtStart = runningPrincipal;
    const dailyInterest = principalAtStart.mul(phase.dailyRate).div(100);
    const paid = paidDates.has(dateKey);
    const capitalizedAmount = paid || !phase.compound ? new Decimal(0) : dailyInterest;
    const principalAtEnd = principalAtStart.plus(capitalizedAmount);

    dailyRecords.push({
      day,
      date: dateKey,
      dailyRate: phase.dailyRate,
      dailyInterest: roundMoney(dailyInterest),
      principalAtStart: roundMoney(principalAtStart),
      principalAtEnd: roundMoney(principalAtEnd),
      capitalizedAmount: roundMoney(capitalizedAmount),
      paid,
    });

    runningPrincipal = principalAtEnd;
  }

  const nextPhase = getOverduePhase(Math.max(1, overdueDays + 1), overdueConfig);
  const todayInterest = roundMoney(runningPrincipal.mul(nextPhase.dailyRate).div(100));
  const totalOutstanding = roundMoney(runningPrincipal);
  const outstandingPenalty = roundMoney(runningPrincipal.minus(baseAmount));

  return {
    outstandingPenalty,
    totalOutstanding,
    todayInterest,
    dailyRecords,
  };
}

export function calculateRealtimeRepayment(input: RealtimeCalcInput): RealtimeCalcResult {
  const { principal, channel, upfrontFeeRate, overdueConfig, startTime, dueDate } = input;
  const currentTime = input.currentTime ?? new Date();
  const elapsedMs = Math.max(0, currentTime.getTime() - startTime.getTime());
  const elapsedDays = daysBetween(startTime, currentTime);
  const netDisbursement = calcNetDisbursement(principal, upfrontFeeRate, channel);
  const tiers = sortTiers(input.tiers);
  const { tier: currentTier, index: tierIndex } = findCurrentTier(elapsedMs, tiers);
  const dueAt = new Date(dueDate);
  const overdueStartDate = new Date(dueAt.getTime() + overdueConfig.graceHours * HOUR_MS);
  const isOverdue = currentTime.getTime() > overdueStartDate.getTime();
  const normalTier = currentTier ?? tiers[tiers.length - 1] ?? null;
  const normalRate = normalTier?.ratePercent ?? 0;
  const repaymentAmount = calcRepaymentAmount(principal, normalRate, channel);
  const feeAmount =
    channel === "UPFRONT_DEDUCTION"
      ? roundMoney(new Decimal(principal).minus(netDisbursement))
      : roundMoney(new Decimal(repaymentAmount).minus(principal));

  if (!isOverdue) {
    return {
      principal,
      channel,
      netDisbursement,
      startTime,
      currentTime,
      elapsedMs,
      elapsedDays,
      elapsedFormatted: formatElapsed(elapsedMs),
      currentTier: normalTier,
      tierIndex,
      tiers,
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

  const overdueMs = currentTime.getTime() - overdueStartDate.getTime();
  const overdueDays = Math.max(1, Math.ceil(overdueMs / DAY_MS));
  const dueTier = tiers[tiers.length - 1] ?? normalTier;
  const dueAmount = calcRepaymentAmount(principal, dueTier?.ratePercent ?? 0, channel);
  const overdue = calculateOverdueBreakdown({
    baseAmount: dueAmount,
    overdueDays,
    overdueConfig,
    overdueStartDate,
    paidDates: input.paidDates,
  });

  return {
    principal,
    channel,
    netDisbursement,
    startTime,
    currentTime,
    elapsedMs,
    elapsedDays,
    elapsedFormatted: formatElapsed(elapsedMs),
    currentTier: dueTier ?? null,
    tierIndex: tiers.length > 0 ? tiers.length - 1 : -1,
    tiers,
    repaymentAmount: dueAmount,
    feeAmount:
      channel === "UPFRONT_DEDUCTION"
        ? roundMoney(new Decimal(principal).minus(netDisbursement))
        : roundMoney(new Decimal(dueAmount).minus(principal)),
    isOverdue: true,
    overdueDays,
    overduePenalty: overdue.outstandingPenalty,
    todayInterest: overdue.todayInterest,
    totalRepayment: overdue.totalOutstanding,
    dailyRecords: overdue.dailyRecords,
  };
}

function getSetting(systemSettings: Record<string, string | number>, keys: string[], fallback: number): number {
  for (const key of keys) {
    if (key in systemSettings) return parseNumericValue(systemSettings[key], fallback);
  }
  return fallback;
}

export function loadFeeConfig(
  systemSettings: Record<string, string | number>,
  loanOverride?: Record<string, number | string> | null
): {
  tiers: RepaymentTier[];
  overdueConfig: OverdueConfig;
  upfrontFeeRate: number;
  channel: ChannelType;
} {
  const mergedSettings: Record<string, string | number> = {
    ...systemSettings,
    ...(loanOverride ?? {}),
  };

  const upfrontFeeRate = getSetting(mergedSettings, ["loan_upfront_flat_rate", "fee_upfront_rate"], 5);
  const rate5h = getSetting(mergedSettings, ["loan_fee_5h_rate", "fee_same_day_rate"], 2);
  const rate24h = getSetting(mergedSettings, ["loan_fee_24h_rate", "fee_next_day_rate"], 3);
  const rate48h = getSetting(mergedSettings, ["loan_fee_48h_rate", "fee_other_day_rate"], 4);
  const rate7d = getSetting(mergedSettings, ["loan_fee_7d_rate", "fee_day3_day7_rate"], 6);
  const graceHours = getSetting(mergedSettings, ["loan_overdue_grace_hours", "fee_overdue_grace_hours"], 0);
  const overdueRateBefore7 = getSetting(mergedSettings, ["loan_overdue_rate_per_day_before_7"], 1);
  const overdueRateBefore30 = getSetting(mergedSettings, ["loan_overdue_rate_per_day_before_30", "fee_overdue_rate_after_14"], 2);
  const overdueRateAfter30 = getSetting(mergedSettings, ["loan_overdue_rate_per_day_after_30"], 3);
  const rawChannel = String(mergedSettings.fee_channel ?? mergedSettings.loan_channel ?? "FULL_AMOUNT");
  const channel: ChannelType = rawChannel === "UPFRONT_DEDUCTION" ? "UPFRONT_DEDUCTION" : "FULL_AMOUNT";

  return {
    tiers: sortTiers([
      { maxDays: 0, maxHours: 5, ratePercent: rate5h, label: "5小时内还" },
      { maxDays: 1, maxHours: 24, ratePercent: rate24h, label: "24小时内还" },
      { maxDays: 2, maxHours: 48, ratePercent: rate48h, label: "48小时内还" },
      { maxDays: 7, maxHours: 7 * 24, ratePercent: rate7d, label: "48小时后至7天内还" },
    ]),
    overdueConfig: {
      graceHours,
      phases: sortOverduePhases([
        { startDay: 1, maxDay: 7, dailyRate: overdueRateBefore7, label: "逾期第1-7天", compound: true },
        { startDay: 8, maxDay: 30, dailyRate: overdueRateBefore30, label: "逾期第8-30天", compound: true },
        { startDay: 31, maxDay: null, dailyRate: overdueRateAfter30, label: "逾期第31天起", compound: true },
      ]),
    },
    upfrontFeeRate,
    channel,
  };
}

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
  const phases: OverduePhase[] = [];
  let upfrontFeeRate = DEFAULT_UPFRONT_FEE_RATE;
  let channel: ChannelType = "FULL_AMOUNT";
  let graceHours = DEFAULT_OVERDUE.graceHours;

  for (const rule of rules) {
    const cond = rule.conditionJson ? (JSON.parse(rule.conditionJson) as Record<string, unknown>) : {};
    const value = Number(rule.rateValue);

    if (rule.ruleType === "UPFRONT_FEE") {
      upfrontFeeRate = value;
      continue;
    }

    if (rule.ruleType === "CHANNEL") {
      channel = String(cond.type) === "UPFRONT_DEDUCTION" ? "UPFRONT_DEDUCTION" : "FULL_AMOUNT";
      continue;
    }

    if (rule.ruleType === "OVERDUE_GRACE") {
      graceHours = Number(cond.maxHours ?? cond.graceHours ?? value);
      continue;
    }

    if (rule.ruleType === "TIER_RATE") {
      const maxHours = Number(cond.maxHours ?? 0) || Number(cond.maxDays ?? 7) * 24;
      const maxDays = Number(cond.maxDays ?? Math.ceil(maxHours / 24));
      tiers.push({
        maxDays,
        maxHours,
        ratePercent: value,
        label: String(cond.label ?? `${maxHours}小时内还`),
      });
      continue;
    }

    if (rule.ruleType.startsWith("OVERDUE_PHASE")) {
      const phaseNumber = Number(rule.ruleType.replace("OVERDUE_PHASE", "")) || phases.length + 1;
      const defaultStartDay = phaseNumber === 1 ? 1 : phaseNumber === 2 ? 8 : 31;
      const defaultMaxDay = phaseNumber === 1 ? 7 : phaseNumber === 2 ? 30 : null;
      phases.push({
        startDay: Number(cond.startDay ?? defaultStartDay),
        maxDay: cond.maxOverdueDay == null && cond.maxDays == null ? defaultMaxDay : Number(cond.maxOverdueDay ?? cond.maxDays),
        dailyRate: value,
        label: String(cond.label ?? `逾期阶段 ${phaseNumber}`),
        compound: cond.compound === false ? false : true,
      });
    }
  }

  return {
    tiers: tiers.length > 0 ? sortTiers(tiers) : [...DEFAULT_TIERS],
    overdueConfig: {
      graceHours,
      phases: phases.length > 0 ? sortOverduePhases(phases) : [...DEFAULT_OVERDUE.phases],
    },
    upfrontFeeRate,
    channel,
  };
}
