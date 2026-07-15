import { describe, expect, it } from "vitest";
import { getClientLoanTermsError } from "./client-loan-terms";

const product = {
  minAmount: 1_000,
  maxAmount: 20_000,
  minTermValue: 7,
  maxTermValue: 30,
};

describe("client loan terms", () => {
  it("accepts terms within product and credit bounds", () => {
    expect(
      getClientLoanTermsError({
        terms: { amount: 8_000, termValue: 7 },
        product,
        creditLimit: 10_000,
      }),
    ).toBeNull();
  });

  it("keeps the effective credit limit stricter than the product maximum", () => {
    expect(
      getClientLoanTermsError({
        terms: { amount: 10_000.01, termValue: 7 },
        product,
        creditLimit: 10_000,
      }),
    ).toContain("可借额度");
  });

  it("rejects product amount and term violations", () => {
    expect(
      getClientLoanTermsError({
        terms: { amount: 500, termValue: 7 },
        product,
        creditLimit: 10_000,
      }),
    ).toContain("申请金额需在");
    expect(
      getClientLoanTermsError({
        terms: { amount: 5_000, termValue: 31 },
        product,
        creditLimit: 10_000,
      }),
    ).toContain("借款期限需在");
  });
});
