import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("capital inflow bank evidence guard", () => {
  it("persists structured evidence and account-scoped transaction uniqueness", () => {
    const schema = source("prisma/schema.prisma");
    expect(schema).toContain('transactionId   String    @map("transaction_id")');
    expect(schema).toContain('senderBank      String    @map("sender_bank")');
    expect(schema).toContain('senderAccount   String    @map("sender_account")');
    expect(schema).toContain("@@unique([fundAccountId, transactionId])");
    expect(schema).toContain('@relation("CapitalInflowReviewer"');
  });

  it("requires protected proof and finance review before crediting an account", () => {
    const createRoute = source("src/app/api/fund-accounts/[id]/inflows/route.ts");
    const reviewRoute = source("src/app/api/fund-accounts/[id]/inflows/[inflowId]/route.ts");

    expect(createRoute).toContain("validateCapitalInflowEvidence");
    expect(createRoute).toContain("createProofAttachment");
    expect(createRoute).toContain('requirePermission(["inflow:create"])');
    expect(reviewRoute).toContain('requirePermission(["inflow:review"])');
    expect(reviewRoute).toContain("Capital inflow bank evidence is missing");
    expect(reviewRoute).toContain("reviewedById: session.sub");
    expect(reviewRoute).toContain("withIdempotencyResponse");
  });

  it("exposes a finance workflow and reconciliation findings", () => {
    const page = source("src/components/admin/pages/capitalinflowspageclient.tsx");
    const reconciliation = source("src/services/finance-reconciliation.service.ts");

    expect(page).toContain('fetch("/api/admin/capital-inflows"');
    expect(page).toContain('formData.append("transactionId"');
    expect(reconciliation).toContain("CAPITAL_INFLOW_BANK_EVIDENCE_MISSING");
    expect(reconciliation).toContain("CAPITAL_INFLOW_PAYMENT_PROOF_MISSING");
  });
});
