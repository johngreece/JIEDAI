import { describe, expect, it } from "vitest";

import {
  LoanContractTermsError,
  buildLoanContractTerms,
  getLoanContractRepaymentComponents,
  resolveLoanContractTerms,
} from "@/lib/loan-contract-terms";

describe("loan contract terms", () => {
  it("builds an EUR snapshot with an upfront legal fee", () => {
    expect(buildLoanContractTerms({
      basePrincipal: 10_000,
      capitalizedInterestAmount: 2_000,
      contractPrincipal: 12_000,
      legalServiceFee: 500,
      feePaymentMode: "UPFRONT_DEDUCTION",
    })).toMatchObject({
      currency: "EUR",
      basePrincipal: 10_000,
      contractPrincipal: 12_000,
      netDisbursementAmount: 9_500,
      upfrontFeeAmount: 500,
      repayableFeeAmount: 0,
      totalPayable: 12_000,
    });
  });

  it("adds a deferred legal fee to the total payable", () => {
    const terms = buildLoanContractTerms({
      basePrincipal: 10_000,
      capitalizedInterestAmount: 2_000,
      legalServiceFee: 500,
      feePaymentMode: "FULL_AMOUNT",
    });

    expect(terms).toMatchObject({
      netDisbursementAmount: 10_000,
      upfrontFeeAmount: 0,
      repayableFeeAmount: 500,
      totalPayable: 12_500,
    });
    expect(getLoanContractRepaymentComponents(terms)).toEqual({
      principal: 10_000,
      interest: 2_000,
      fee: 500,
      totalDue: 12_500,
    });
  });

  it("rejects a contract principal that drifts from its components", () => {
    expect(() => buildLoanContractTerms({
      basePrincipal: 10_000,
      capitalizedInterestAmount: 2_000,
      contractPrincipal: 11_999,
    })).toThrow(LoanContractTermsError);
  });

  it("rejects invalid legal fees and fee payment modes on the server", () => {
    expect(() => buildLoanContractTerms({
      basePrincipal: 1_000,
      legalServiceFee: 1_000,
      feePaymentMode: "FULL_AMOUNT",
    })).toThrow("法律服务费必须小于基础本金");

    expect(() => buildLoanContractTerms({
      basePrincipal: 1_000,
      feePaymentMode: "INVALID",
    })).toThrow("法律服务费支付方式无效");
  });

  it("resolves historical contract JSON before falling back to application amount", () => {
    const terms = resolveLoanContractTerms({
      variableData: JSON.stringify({
        contractGenerationOptions: {
          basePrincipal: 1_000,
          capitalizedInterestAmount: 200,
          contractPrincipal: 1_200,
        },
      }),
    }, 900);

    expect(terms.source).toBe("legacy_variable_data");
    expect(terms.contractPrincipal).toBe(1_200);
  });

  it("falls back safely when historical JSON is inconsistent", () => {
    const terms = resolveLoanContractTerms({
      variableData: JSON.stringify({
        contractGenerationOptions: {
          basePrincipal: 1_000,
          capitalizedInterestAmount: 200,
          contractPrincipal: 9_999,
        },
      }),
    }, 900);

    expect(terms.source).toBe("application_fallback");
    expect(terms.contractPrincipal).toBe(900);
  });
});
