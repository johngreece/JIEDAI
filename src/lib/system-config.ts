export const SYSTEM_CURRENCY = "EUR" as const;
export const SYSTEM_LOCALE = "zh-CN" as const;
export const SYSTEM_TIME_ZONE = "Europe/Athens" as const;

export type MoneyValue = number | string | bigint | { toString(): string };

function normalizeMoneyValue(value: MoneyValue): number {
  const normalized = typeof value === "number" ? value : Number(value.toString());
  if (!Number.isFinite(normalized)) {
    throw new TypeError(`Invalid money value: ${String(value)}`);
  }
  return normalized;
}

export function formatMoney(value: MoneyValue): string {
  return new Intl.NumberFormat(SYSTEM_LOCALE, {
    style: "currency",
    currency: SYSTEM_CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(normalizeMoneyValue(value));
}
