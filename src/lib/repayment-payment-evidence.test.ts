import { describe, expect, it } from "vitest";
import { validateRepaymentPaymentEvidence } from "./repayment-payment-evidence";

describe("repayment payment evidence", () => {
  const validEvidence = {
    transactionId: "BANK-20260715-001",
    payerBank: "Example Bank",
    payerAccount: "DE89-3704-0044-0532-0130-00",
  };

  it("accepts a protected proof upload", () => {
    const proof = new File(["proof"], "receipt.pdf", { type: "application/pdf" });
    const result = validateRepaymentPaymentEvidence(validEvidence, proof);

    expect(result.success).toBe(true);
  });

  it("accepts an HTTPS evidence link", () => {
    const result = validateRepaymentPaymentEvidence(
      { ...validEvidence, proofUrl: "https://example.test/receipt.pdf" },
      null,
    );

    expect(result.success).toBe(true);
  });

  it("rejects a repayment without proof", () => {
    const result = validateRepaymentPaymentEvidence(validEvidence, null);

    expect(result).toMatchObject({
      success: false,
      error: "Upload payment evidence or provide an HTTPS evidence link",
    });
  });

  it("rejects unsafe transaction IDs and non-HTTPS links", () => {
    const result = validateRepaymentPaymentEvidence(
      {
        ...validEvidence,
        transactionId: "bank transfer #1",
        proofUrl: "http://example.test/receipt.pdf",
      },
      null,
    );

    expect(result.success).toBe(false);
  });
});
