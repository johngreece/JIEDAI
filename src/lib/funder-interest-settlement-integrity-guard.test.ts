import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("funder interest settlement integrity guard", () => {
  it("uses internal posting states and dedicated finance permissions", () => {
    const service = source("src/services/funder-interest-settlement.service.ts");
    const route = source("src/app/api/funder-interest-settlements/route.ts");
    const seed = source("prisma/seed.js");

    expect(service).toContain('POSTED_BY_PLATFORM: "POSTED_BY_PLATFORM"');
    expect(service).toContain('FUNDER_DISPUTED: "FUNDER_DISPUTED"');
    expect(service).not.toContain("PAID_BY_PLATFORM:");
    expect(service).not.toContain("FUNDER_REJECTED:");
    expect(route).toContain('requirePermission(["settlement:view"])');
    expect(route).toContain('requirePermission(["settlement:manage"])');
    expect(seed).toContain('"settlement:view"');
    expect(seed).toContain('"settlement:manage"');
  });

  it("credits the internal account only after funder confirmation", () => {
    const service = source("src/services/funder-interest-settlement.service.ts");
    const postSection = service.slice(
      service.indexOf("static async postByPlatform"),
      service.indexOf("static async confirmByFunder"),
    );
    const confirmSection = service.slice(
      service.indexOf("static async confirmByFunder"),
      service.indexOf("static async disputeByFunder"),
    );

    expect(postSection).not.toContain("writeFundAccountLedgerEntryAndUpdateAccount");
    expect(confirmSection).toContain("writeFundAccountLedgerEntryAndUpdateAccount");
    expect(confirmSection).toContain('type: "INTEREST_SETTLEMENT"');
    expect(confirmSection).toContain('direction: "CREDIT"');
    expect(confirmSection).toContain("totalProfitDelta");
    expect(confirmSection).toContain('referenceType: "funder_interest_settlement"');
  });

  it("keeps bank payout and reconciliation in the withdrawal chain", () => {
    const settlementService = source("src/services/funder-interest-settlement.service.ts");
    const withdrawalRoute = source("src/app/api/funder-withdrawals/route.ts");
    const reconciliation = source("src/services/finance-reconciliation.service.ts");

    expect(settlementService).toContain("银行出金需另行发起提现");
    expect(withdrawalRoute).toContain("validateBankTransactionEvidence");
    expect(withdrawalRoute).toContain("storeProofFile");
    expect(reconciliation).toContain('settlement.status !== "CONFIRMED_BY_FUNDER"');
    expect(reconciliation).toContain("INTEREST_SETTLEMENT_WITHOUT_CONFIRMATION");
  });

  it("returns a conflict response when a concurrent decision loses the state claim", () => {
    const adminRoute = source("src/app/api/funder-interest-settlements/route.ts");
    const funderRoute = source("src/app/api/funder/interest-settlements/route.ts");

    expect(adminRoute).toContain('message.includes("状态已变化") ? 409 : 400');
    expect(funderRoute).toContain('message.includes("状态已变化") ? 409 : 400');
  });

  it("keeps the legacy aggregate settlement surface read-only", () => {
    const legacyRoute = source("src/app/api/settlement/route.ts");
    const legacyService = source("src/services/settlement.service.ts");
    const settlementPage = source("src/components/admin/pages/SettlementPageClient.tsx");

    expect(legacyRoute).not.toContain("export async function POST");
    expect(legacyRoute).not.toContain("persist-funder-shares");
    expect(legacyRoute).not.toContain("settle-funder-share");
    expect(legacyService).not.toMatch(/fundProfitShare\.(create|update|delete|upsert)\s*\(/);
    expect(legacyService).toContain("interestSettlements:");
    expect(settlementPage).toContain("item.settlementSummary");
    expect(settlementPage).not.toContain("item.existingSettlement");
    expect(settlementPage).toContain("toDateInputValue");
    expect(settlementPage).not.toContain("toISOString().slice(0, 10)");
  });
});
