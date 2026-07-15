import { formatMoney } from "@/lib/system-config";

type ClientLoanTerms = {
  amount: number;
  termValue: number;
};

type ProductBounds = {
  minAmount: number;
  maxAmount: number;
  minTermValue: number;
  maxTermValue: number;
};

export function getClientLoanTermsError(input: {
  terms: ClientLoanTerms;
  product: ProductBounds;
  creditLimit: number;
}): string | null {
  const { amount, termValue } = input.terms;

  if (!Number.isFinite(amount) || amount <= 0) {
    return "申请金额必须大于 0";
  }
  if (!Number.isInteger(termValue) || termValue <= 0) {
    return "借款期限必须为正整数";
  }
  if (amount - input.creditLimit > 0.000001) {
    return `申请金额不能超过可借额度 ${formatMoney(input.creditLimit)}`;
  }
  if (
    amount + 0.000001 < input.product.minAmount ||
    amount - input.product.maxAmount > 0.000001
  ) {
    return `申请金额需在 ${formatMoney(input.product.minAmount)} 到 ${formatMoney(input.product.maxAmount)} 之间`;
  }
  if (
    termValue < input.product.minTermValue ||
    termValue > input.product.maxTermValue
  ) {
    return `借款期限需在 ${input.product.minTermValue} 到 ${input.product.maxTermValue} 之间`;
  }

  return null;
}
