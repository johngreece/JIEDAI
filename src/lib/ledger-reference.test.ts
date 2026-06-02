import { describe, expect, it } from "vitest";

import { buildOverdueInterestLedgerReferenceId } from "@/lib/ledger-reference";

describe("ledger reference helpers", () => {
  it("scopes overdue interest payments to one overdue record and one paid date", () => {
    expect(buildOverdueInterestLedgerReferenceId("overdue-1", "2026-06-02")).toBe(
      "overdue-1:2026-06-02",
    );
  });
});

