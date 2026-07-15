import { describe, expect, it } from "vitest";
import { validateDisbursementEvidence } from "./disbursement-evidence";

describe("disbursement evidence validation", () => {
  it("accepts a bank transaction ID with an HTTPS evidence link", () => {
    const result = validateDisbursementEvidence(
      {
        transactionId: "BANK-2026/000184",
        proofUrl: "https://files.example.test/disbursement-184.pdf",
      },
      null,
    );

    expect(result.success).toBe(true);
  });

  it("accepts a private evidence file without an external link", () => {
    const file = new File(["bank receipt"], "receipt.pdf", {
      type: "application/pdf",
    });
    const result = validateDisbursementEvidence(
      { transactionId: "TRX_2026.184" },
      file,
    );

    expect(result.success).toBe(true);
  });

  it("rejects confirmations without evidence", () => {
    const result = validateDisbursementEvidence(
      { transactionId: "BANK-184" },
      null,
    );

    expect(result).toMatchObject({
      success: false,
      error: "Upload bank evidence or provide an HTTPS evidence link",
    });
  });

  it("rejects insecure evidence links and malformed transaction IDs", () => {
    expect(
      validateDisbursementEvidence(
        { transactionId: "BANK 184", proofUrl: "http://example.test/receipt.pdf" },
        null,
      ).success,
    ).toBe(false);
  });
});
