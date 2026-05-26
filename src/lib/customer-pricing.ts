import Decimal from "decimal.js";

import type { ChannelType, OverdueConfig, RepaymentTier } from "@/lib/interest-engine";

export type PricingConfig = {
  tiers: RepaymentTier[];
  overdueConfig: OverdueConfig;
  upfrontFeeRate: number;
  channel: ChannelType;
};

export type CustomerPricingProfile = {
  weeklyInterestRateOverride?: unknown | null;
};

export type CustomerPricingMeta = {
  source: "product_default" | "customer_override";
  weeklyInterestRate: number;
  weeklyInterestRateOverride: number | null;
};

export type EffectivePricingConfig = PricingConfig & {
  customerPricing: CustomerPricingMeta;
};

function tierHours(tier: RepaymentTier) {
  return tier.maxHours ?? tier.maxDays * 24;
}

function isFixedShortWindowTier(tier: RepaymentTier) {
  const hours = tierHours(tier);
  return tier.windowType === "SAME_NIGHT" || tier.windowType === "NEXT_CALENDAR_DAY" || hours <= 24;
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null;
  const numeric = Number(typeof value === "object" && "toString" in value ? value.toString() : value);
  return Number.isFinite(numeric) ? numeric : null;
}

function money(value: Decimal.Value) {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

export function getCustomerWeeklyInterestRateOverride(customer?: CustomerPricingProfile | null) {
  const override = toFiniteNumber(customer?.weeklyInterestRateOverride);
  if (override == null || override < 0 || override > 100) return null;
  return override;
}

export function getWeeklyInterestRateFromTiers(tiers: RepaymentTier[]) {
  const sorted = [...tiers].sort((a, b) => tierHours(a) - tierHours(b));
  return sorted[sorted.length - 1]?.ratePercent ?? 0;
}

export function applyCustomerPricingOverride(
  config: PricingConfig,
  customer?: CustomerPricingProfile | null,
): EffectivePricingConfig {
  const sortedTiers = [...config.tiers].sort((a, b) => tierHours(a) - tierHours(b));
  const defaultWeeklyRate = getWeeklyInterestRateFromTiers(sortedTiers);
  const override = getCustomerWeeklyInterestRateOverride(customer);

  if (override == null) {
    return {
      ...config,
      tiers: sortedTiers,
      customerPricing: {
        source: "product_default",
        weeklyInterestRate: defaultWeeklyRate,
        weeklyInterestRateOverride: null,
      },
    };
  }

  const longestTierHours = sortedTiers[sortedTiers.length - 1]
    ? tierHours(sortedTiers[sortedTiers.length - 1])
    : 7 * 24;

  const adjustedTiers = sortedTiers.map((tier) => {
    const hours = tierHours(tier);
    if (hours === longestTierHours) {
      return { ...tier, ratePercent: override };
    }
    if (!isFixedShortWindowTier(tier) && hours < longestTierHours && tier.ratePercent > override) {
      return { ...tier, ratePercent: override };
    }
    return tier;
  });

  return {
    ...config,
    tiers: adjustedTiers,
    upfrontFeeRate: override,
    customerPricing: {
      source: "customer_override",
      weeklyInterestRate: override,
      weeklyInterestRateOverride: override,
    },
  };
}

export function buildCustomerPricingQuote(principal: number, config: EffectivePricingConfig) {
  const weeklyInterestRate = config.customerPricing.weeklyInterestRate;
  const weeklyInterestAmount = money(new Decimal(principal).mul(weeklyInterestRate).div(100));

  return {
    source: config.customerPricing.source,
    weeklyInterestRate,
    weeklyInterestRateOverride: config.customerPricing.weeklyInterestRateOverride,
    contractDisplayInterestRate: `${new Decimal(weeklyInterestRate).toDecimalPlaces(4).toString()}%`,
    weeklyInterestAmount: weeklyInterestAmount.toFixed(2),
    monthlyInterestAmount: money(new Decimal(weeklyInterestAmount).mul(4)).toFixed(2),
  };
}
