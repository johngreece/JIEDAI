import { describe, expect, it } from "vitest";

import {
  compareMoney,
  evaluateBalanceChain,
  expectEntry,
  expectNoEntry,
  moneyText,
} from "./finance-reconciliation";

const baseEntry = {
  id: "entry-1",
  type: "REPAYMENT",
  direction: "CREDIT",
  amount: "100.0000",
  balanceBefore: "0.0000",
  balanceAfter: "100.0000",
  ownerId: "account-1",
};

describe("finance reconciliation rules", () => {
  it("normalizes money to the database scale", () => {
    expect(moneyText("10.123456")).toBe("10.1235");
    expect(moneyText(undefined)).toBe("0.0000");
  });

  it("accepts a matching expected entry", () => {
    expect(
      expectEntry({
        code: "REPAYMENT_FUND_JOURNAL",
        entityType: "repayment",
        entityId: "repayment-1",
        label: "Repayment journal",
        expected: {
          type: "REPAYMENT",
          direction: "CREDIT",
          amount: "100",
          ownerId: "account-1",
        },
        actual: baseEntry,
        recommendedAction: "Review",
      }),
    ).toEqual([]);
  });

  it("reports missing and mismatched entries with stable fingerprints", () => {
    const missing = expectEntry({
      code: "REPAYMENT_FUND_JOURNAL",
      entityType: "repayment",
      entityId: "repayment-1",
      label: "Repayment journal",
      expected: { type: "REPAYMENT", direction: "CREDIT", amount: "100" },
      recommendedAction: "Review",
    });
    const mismatched = expectEntry({
      code: "REPAYMENT_FUND_JOURNAL",
      entityType: "repayment",
      entityId: "repayment-1",
      label: "Repayment journal",
      expected: { type: "REPAYMENT", direction: "CREDIT", amount: "99" },
      actual: baseEntry,
      recommendedAction: "Review",
    });

    expect(missing[0]).toMatchObject({
      code: "REPAYMENT_FUND_JOURNAL_MISSING",
      actualValue: "MISSING",
    });
    expect(missing[0].fingerprint).toContain("REPAYMENT_FUND_JOURNAL_MISSING");
    expect(mismatched[0].code).toBe("REPAYMENT_FUND_JOURNAL_MISMATCH");
  });

  it("reports an entry that should not exist", () => {
    expect(
      expectNoEntry({
        code: "UNEXPECTED_ENTRY",
        entityType: "repayment",
        entityId: "repayment-1",
        label: "Repayment journal",
        actual: baseEntry,
        recommendedAction: "Review",
      })[0].code,
    ).toBe("UNEXPECTED_ENTRY");
  });

  it("validates a complete balance chain and current balance", () => {
    const findings = evaluateBalanceChain({
      entityType: "fund_account",
      entityId: "account-1",
      codePrefix: "FUND_JOURNAL",
      label: "Fund journal",
      recordedBalance: "60",
      entries: [
        baseEntry,
        {
          ...baseEntry,
          id: "entry-2",
          type: "DISBURSEMENT",
          direction: "DEBIT",
          amount: "40",
          balanceBefore: "100",
          balanceAfter: "60",
        },
      ],
    });

    expect(findings).toEqual([]);
  });

  it("detects broken snapshots, negative balances and a stale account balance", () => {
    const findings = evaluateBalanceChain({
      entityType: "fund_account",
      entityId: "account-1",
      codePrefix: "FUND_JOURNAL",
      label: "Fund journal",
      recordedBalance: "10",
      entries: [
        {
          ...baseEntry,
          direction: "DEBIT",
          amount: "20",
          balanceBefore: "5",
          balanceAfter: "1",
        },
      ],
    });

    expect(findings.map((finding) => finding.code)).toEqual([
      "FUND_JOURNAL_BALANCE_BEFORE",
      "FUND_JOURNAL_BALANCE_AFTER",
      "FUND_JOURNAL_NEGATIVE_BALANCE",
      "FUND_JOURNAL_CURRENT_BALANCE",
    ]);
  });

  it("allows negative customer-ledger balances while preserving snapshot checks", () => {
    expect(
      evaluateBalanceChain({
        entityType: "customer",
        entityId: "customer-1",
        codePrefix: "CUSTOMER_LEDGER",
        label: "Customer ledger",
        allowNegative: true,
        entries: [
          {
            ...baseEntry,
            direction: "DEBIT",
            amount: "20",
            balanceBefore: "0",
            balanceAfter: "-20",
          },
        ],
      }),
    ).toEqual([]);
  });

  it("compares independent account totals at four decimal places", () => {
    expect(
      compareMoney({
        code: "TOTAL_INFLOW",
        entityType: "fund_account",
        entityId: "account-1",
        label: "Total inflow",
        expected: "1.00001",
        actual: "1",
        recommendedAction: "Review",
      }),
    ).toEqual([]);
    expect(
      compareMoney({
        code: "TOTAL_INFLOW",
        entityType: "fund_account",
        entityId: "account-1",
        label: "Total inflow",
        expected: "1.001",
        actual: "1",
        recommendedAction: "Review",
      })[0].code,
    ).toBe("TOTAL_INFLOW");
  });
});
