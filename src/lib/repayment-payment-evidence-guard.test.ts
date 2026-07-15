import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("repayment payment evidence guard", () => {
  it("persists globally unique transaction identity and payer evidence", () => {
    const schema = source("prisma/schema.prisma");

    expect(schema).toContain('transactionId       String    @unique @map("transaction_id")');
    expect(schema).toContain('payerBank           String    @map("payer_bank")');
    expect(schema).toContain('payerAccount        String    @map("payer_account")');
  });

  it("requires protected proof for both registration paths", () => {
    const clientRoute = source("src/app/api/client/repayments/route.ts");
    const adminRoute = source("src/app/api/repayments/route.ts");

    for (const route of [clientRoute, adminRoute]) {
      expect(route).toContain("validateRepaymentPaymentEvidence");
      expect(route).toContain('entityType: "repayment"');
      expect(route).toContain('category: "REPAYMENT_PAYMENT_PROOF"');
      expect(route).toContain("createProofAttachment");
    }
  });

  it("blocks confirmation and reports reconciliation gaps", () => {
    const confirmation = source("src/lib/repayment-confirm.ts");
    const reconciliation = source("src/services/finance-reconciliation.service.ts");

    expect(confirmation).toContain("REPAYMENT_BANK_EVIDENCE_MISSING");
    expect(confirmation).toContain("REPAYMENT_PAYMENT_PROOF_MISSING");
    expect(confirmation).toContain("proofAttachmentId");
    expect(reconciliation).toContain("REPAYMENT_BANK_EVIDENCE_MISSING");
    expect(reconciliation).toContain("REPAYMENT_PAYMENT_PROOF_MISSING");
  });

  it("limits customer proof access to owned repayments", () => {
    const fileRoute = source("src/app/api/attachments/[id]/file/route.ts");

    expect(fileRoute).toContain('attachment.entityType !== "repayment"');
    expect(fileRoute).toContain("customerId: session.sub");
    expect(fileRoute).toContain('entityType: { in: ["capital_inflow", "disbursement", "funder_withdrawal", "repayment"] }');
  });
});
