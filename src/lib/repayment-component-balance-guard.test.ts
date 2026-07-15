import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("repayment component balance guards", () => {
  it("persists component balances for every repayment schedule creation path", () => {
    const schema = source("prisma/schema.prisma");
    const creationPaths = [
      "src/app/api/disbursements/[id]/confirm-paid/route.ts",
      "src/services/extension.service.ts",
      "src/app/api/restructures/[id]/approve/route.ts",
    ];

    expect(schema).toContain("remainingPrincipal Decimal");
    expect(schema).toContain("remainingInterest  Decimal");
    expect(schema).toContain("remainingFee       Decimal");

    for (const relativePath of creationPaths) {
      const contents = source(relativePath);
      expect(contents, relativePath).toContain("repaymentScheduleItem.create");
      expect(contents, relativePath).toContain("remainingPrincipal:");
      expect(contents, relativePath).toContain("remainingInterest:");
      expect(contents, relativePath).toMatch(/remainingFee(?:\s*:|,)/);
    }
  });

  it("allocates and confirms repayments against component balances", () => {
    const allocation = source("src/lib/repayment-allocation.ts");
    const confirmation = source("src/lib/repayment-confirm.ts");

    expect(allocation).toContain("hasComponentBalances");
    expect(allocation).toContain("item.remainingPrincipal");
    expect(allocation).toContain("item.remainingInterest");
    expect(allocation).toContain("item.remainingFee");
    expect(confirmation).toContain("SCHEDULE_COMPONENT_BALANCES_MISSING");
    expect(confirmation).toContain("remainingPrincipal: nextPrincipal");
    expect(confirmation).toContain("remainingInterest: nextInterest");
    expect(confirmation).toContain("remainingFee: nextFee");
  });
});
