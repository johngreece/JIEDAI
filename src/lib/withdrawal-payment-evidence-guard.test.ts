import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("funder withdrawal payment evidence guard", () => {
  it("uses dedicated finance permissions instead of settings administration", () => {
    const route = readSource("src/app/api/funder-withdrawals/route.ts");
    const attachmentRoute = readSource("src/app/api/attachments/[id]/file/route.ts");
    const seed = readSource("prisma/seed.js");

    expect(route).toContain('requirePermission(["withdrawal:view"])');
    expect(route).toContain('requirePermission(["withdrawal:review"])');
    expect(attachmentRoute).toContain(
      'attachment.entityType === "funder_withdrawal" ? "withdrawal:view" : "ledger:view"',
    );
    expect(route).not.toContain('requirePermission(["settings:edit"])');
    expect(seed).toContain('"withdrawal:view"');
    expect(seed).toContain('"withdrawal:review"');
  });

  it("persists the payout identity, protected proof and account-scoped uniqueness", () => {
    const schema = readSource("prisma/schema.prisma");
    const route = readSource("src/app/api/funder-withdrawals/route.ts");
    const service = readSource("src/services/funder-interest.service.ts");

    expect(schema).toContain("@@unique([accountId, transactionId])");
    expect(route).toContain("validateBankTransactionEvidence");
    expect(route).toContain("storeProofFile");
    expect(service).toContain('entityType: "funder_withdrawal"');
    expect(service).toContain("payerAccount: payingAccount.accountNo");
    expect(service).toContain("transactionId: evidence.transactionId");
  });

  it("makes missing withdrawal bank evidence a reconciliation finding", () => {
    const reconciliation = readSource("src/services/finance-reconciliation.service.ts");

    expect(reconciliation).toContain("WITHDRAWAL_BANK_EVIDENCE_MISSING");
    expect(reconciliation).toContain("WITHDRAWAL_PAYMENT_PROOF_MISSING");
  });
});
