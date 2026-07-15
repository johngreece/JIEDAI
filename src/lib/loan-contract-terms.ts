import Decimal from "decimal.js";
import { SYSTEM_CURRENCY } from "@/lib/system-config";

export type ContractFeePaymentMode = "UPFRONT_DEDUCTION" | "FULL_AMOUNT";

export type LoanContractTermsSource =
  | "structured_contract"
  | "legacy_variable_data"
  | "application_fallback";

export type LoanContractTerms = {
  currency: typeof SYSTEM_CURRENCY;
  basePrincipal: number;
  capitalizedInterestAmount: number;
  contractPrincipal: number;
  legalServiceFee: number;
  feePaymentMode: ContractFeePaymentMode;
  netDisbursementAmount: number;
  upfrontFeeAmount: number;
  repayableFeeAmount: number;
  totalPayable: number;
  source: LoanContractTermsSource;
};

export type LoanContractRepaymentComponents = {
  principal: number;
  interest: number;
  fee: number;
  totalDue: number;
};

export type LoanContractTermsInput = {
  basePrincipal: unknown;
  capitalizedInterestAmount?: unknown;
  contractPrincipal?: unknown;
  legalServiceFee?: unknown;
  feePaymentMode?: unknown;
  currency?: unknown;
};

export type StoredLoanContractTerms = {
  basePrincipal?: unknown | null;
  capitalizedInterestAmount?: unknown | null;
  contractPrincipal?: unknown | null;
  legalServiceFee?: unknown | null;
  feePaymentMode?: unknown | null;
  currency?: unknown | null;
  variableData?: string | null;
};

export class LoanContractTermsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoanContractTermsError";
  }
}

function money(value: unknown, label: string, allowZero: boolean) {
  let amount: Decimal;
  try {
    amount = new Decimal(String(value));
  } catch {
    throw new LoanContractTermsError(`${label}不是有效金额`);
  }

  if (!amount.isFinite() || (allowZero ? amount.lt(0) : amount.lte(0))) {
    throw new LoanContractTermsError(`${label}${allowZero ? "不能小于 0" : "必须大于 0"}`);
  }

  return amount.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

function feeMode(value: unknown): ContractFeePaymentMode {
  if (value === "FULL_AMOUNT" || value === "UPFRONT_DEDUCTION") return value;
  throw new LoanContractTermsError("法律服务费支付方式无效");
}

export function buildLoanContractTerms(
  input: LoanContractTermsInput,
  source: LoanContractTermsSource = "structured_contract",
): LoanContractTerms {
  const currency = input.currency == null ? SYSTEM_CURRENCY : String(input.currency).toUpperCase();
  if (currency !== SYSTEM_CURRENCY) {
    throw new LoanContractTermsError("系统仅支持 EUR 合同");
  }

  const basePrincipal = money(input.basePrincipal, "基础本金", false);
  const capitalizedInterestAmount = money(
    input.capitalizedInterestAmount ?? 0,
    "并入本金收益",
    true,
  );
  const expectedContractPrincipal = basePrincipal.plus(capitalizedInterestAmount);
  const contractPrincipal = money(
    input.contractPrincipal ?? expectedContractPrincipal,
    "合同本金",
    false,
  );
  if (!contractPrincipal.equals(expectedContractPrincipal)) {
    throw new LoanContractTermsError("合同本金必须等于基础本金与并入本金收益之和");
  }

  const legalServiceFee = money(input.legalServiceFee ?? 0, "法律服务费", true);
  if (legalServiceFee.gte(basePrincipal)) {
    throw new LoanContractTermsError("法律服务费必须小于基础本金");
  }
  const feePaymentMode = feeMode(input.feePaymentMode ?? "UPFRONT_DEDUCTION");
  const upfrontFeeAmount = feePaymentMode === "UPFRONT_DEDUCTION"
    ? legalServiceFee
    : new Decimal(0);
  const repayableFeeAmount = feePaymentMode === "FULL_AMOUNT"
    ? legalServiceFee
    : new Decimal(0);
  const netDisbursementAmount = basePrincipal.minus(upfrontFeeAmount);
  return {
    currency: SYSTEM_CURRENCY,
    basePrincipal: basePrincipal.toNumber(),
    capitalizedInterestAmount: capitalizedInterestAmount.toNumber(),
    contractPrincipal: contractPrincipal.toNumber(),
    legalServiceFee: legalServiceFee.toNumber(),
    feePaymentMode,
    netDisbursementAmount: netDisbursementAmount.toNumber(),
    upfrontFeeAmount: upfrontFeeAmount.toNumber(),
    repayableFeeAmount: repayableFeeAmount.toNumber(),
    totalPayable: contractPrincipal.plus(repayableFeeAmount).toNumber(),
    source,
  };
}

function parseLegacyOptions(variableData: string | null | undefined) {
  if (!variableData) return null;
  try {
    const parsed = JSON.parse(variableData) as {
      contractGenerationOptions?: Record<string, unknown>;
    };
    return parsed.contractGenerationOptions ?? null;
  } catch {
    return null;
  }
}

export function resolveLoanContractTerms(
  contract: StoredLoanContractTerms | null | undefined,
  fallbackBasePrincipal: unknown,
  fallbackFeePaymentMode: ContractFeePaymentMode = "UPFRONT_DEDUCTION",
): LoanContractTerms {
  const hasStructuredTerms = Boolean(
    contract &&
      contract.basePrincipal != null &&
      contract.capitalizedInterestAmount != null &&
      contract.contractPrincipal != null &&
      contract.legalServiceFee != null,
  );

  if (hasStructuredTerms && contract) {
    return buildLoanContractTerms(
      {
        basePrincipal: contract.basePrincipal,
        capitalizedInterestAmount: contract.capitalizedInterestAmount,
        contractPrincipal: contract.contractPrincipal,
        legalServiceFee: contract.legalServiceFee,
        feePaymentMode: contract.feePaymentMode ?? fallbackFeePaymentMode,
        currency: contract.currency ?? SYSTEM_CURRENCY,
      },
      "structured_contract",
    );
  }

  const legacy = parseLegacyOptions(contract?.variableData);
  if (
    legacy?.basePrincipal != null &&
    legacy.capitalizedInterestAmount != null &&
    legacy.contractPrincipal != null
  ) {
    try {
      return buildLoanContractTerms(
        {
          basePrincipal: legacy.basePrincipal,
          capitalizedInterestAmount: legacy.capitalizedInterestAmount,
          contractPrincipal: legacy.contractPrincipal,
          legalServiceFee: legacy.legalServiceFee ?? 0,
          feePaymentMode: legacy.feePaymentMode ?? fallbackFeePaymentMode,
          currency: legacy.currency ?? SYSTEM_CURRENCY,
        },
        "legacy_variable_data",
      );
    } catch {
      // Historical free-form JSON may be incomplete or inconsistent. Preserve the old amount fallback.
    }
  }

  return buildLoanContractTerms(
    {
      basePrincipal: fallbackBasePrincipal,
      capitalizedInterestAmount: 0,
      contractPrincipal: fallbackBasePrincipal,
      legalServiceFee: 0,
      feePaymentMode: fallbackFeePaymentMode,
      currency: SYSTEM_CURRENCY,
    },
    "application_fallback",
  );
}

export function getLoanContractRepaymentComponents(
  terms: LoanContractTerms,
): LoanContractRepaymentComponents {
  return {
    principal: terms.basePrincipal,
    interest: terms.capitalizedInterestAmount,
    fee: terms.repayableFeeAmount,
    totalDue: terms.totalPayable,
  };
}
