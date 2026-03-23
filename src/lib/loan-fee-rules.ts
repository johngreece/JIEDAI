export type FeeRates = {
  upfrontFlatRate: number;
  fee5hRate: number;
  fee24hRate: number;
  fee48hRate: number;
  fee7dRate: number;
  overdueGraceHours: number;
  overdueRatePerDayBefore7: number;
  overdueRatePerDayBefore30: number;
  overdueRatePerDayAfter30: number;
  commercialMonthlyRate: number;
};

export const DEFAULT_FEE_RATES: FeeRates = {
  upfrontFlatRate: 5,
  fee5hRate: 2,
  fee24hRate: 3,
  fee48hRate: 4,
  fee7dRate: 6,
  overdueGraceHours: 0,
  overdueRatePerDayBefore7: 1,
  overdueRatePerDayBefore30: 2,
  overdueRatePerDayAfter30: 3,
  commercialMonthlyRate: 10,
};

export const FEE_SETTING_KEYS = {
  upfrontFlatRate: "loan_upfront_flat_rate",
  fee5hRate: "loan_fee_5h_rate",
  fee24hRate: "loan_fee_24h_rate",
  fee48hRate: "loan_fee_48h_rate",
  fee7dRate: "loan_fee_7d_rate",
  overdueGraceHours: "loan_overdue_grace_hours",
  overdueRatePerDayBefore7: "loan_overdue_rate_per_day_before_7",
  overdueRatePerDayBefore30: "loan_overdue_rate_per_day_before_30",
  overdueRatePerDayAfter30: "loan_overdue_rate_per_day_after_30",
  commercialMonthlyRate: "loan_commercial_monthly_rate",
} as const;
