import { describe, expect, it } from "vitest";

import { orderWithdrawalFundAccountIds } from "@/lib/fund-account-withdrawal";

describe("withdrawal fund account ordering", () => {
  const accounts = [
    { id: "account-a" },
    { id: "account-b" },
    { id: "account-c" },
  ];

  it("prioritizes the requested account and keeps the remaining account order", () => {
    expect(orderWithdrawalFundAccountIds(accounts, "account-b")).toEqual([
      "account-b",
      "account-a",
      "account-c",
    ]);
  });

  it("keeps the service-provided order when no preferred account is requested", () => {
    expect(orderWithdrawalFundAccountIds(accounts)).toEqual([
      "account-a",
      "account-b",
      "account-c",
    ]);
  });

  it("deduplicates account ids before ledger locking", () => {
    expect(
      orderWithdrawalFundAccountIds(
        [
          { id: "account-a" },
          { id: "account-b" },
          { id: "account-a" },
        ],
        "account-a",
      ),
    ).toEqual(["account-a", "account-b"]);
  });
});
