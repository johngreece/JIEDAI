import { describe, expect, it } from "vitest";
import {
  LOAN_TRANSITIONS,
  assertLoanTransition,
  canTransitionLoan,
  getAvailableLoanActions,
  isTerminalLoanStatus,
} from "./loan-lifecycle";

describe("loan lifecycle", () => {
  it("keeps every action bound to one explicit from/to transition", () => {
    const keys = LOAN_TRANSITIONS.map(
      (rule) => `${rule.action}:${rule.from}:${rule.to}`
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(LOAN_TRANSITIONS.every((rule) => rule.permission.length > 0)).toBe(true);
  });

  it("covers the successful main chain", () => {
    expect(canTransitionLoan("DRAFT", "PENDING_RISK", "SUBMIT")).toBe(true);
    expect(canTransitionLoan("PENDING_RISK", "PENDING_APPROVAL", "RISK_PASS")).toBe(true);
    expect(canTransitionLoan("PENDING_APPROVAL", "APPROVED", "APPROVE")).toBe(true);
    expect(canTransitionLoan("APPROVED", "CONTRACTED", "SIGN_CONTRACT")).toBe(true);
    expect(canTransitionLoan("CONTRACTED", "DISBURSED", "CONFIRM_DISBURSEMENT")).toBe(true);
    expect(canTransitionLoan("DISBURSED", "SETTLED", "SETTLE")).toBe(true);
  });

  it("separates supplement returns from terminal rejection", () => {
    expect(canTransitionLoan("PENDING_RISK", "RETURNED", "RISK_RETURN")).toBe(true);
    expect(canTransitionLoan("PENDING_APPROVAL", "RETURNED", "APPROVAL_RETURN")).toBe(true);
    expect(canTransitionLoan("RETURNED", "PENDING_RISK", "RESUBMIT")).toBe(true);
    expect(canTransitionLoan("PENDING_RISK", "REJECTED", "RISK_REJECT")).toBe(true);
    expect(canTransitionLoan("PENDING_APPROVAL", "REJECTED", "APPROVAL_REJECT")).toBe(true);
    expect(canTransitionLoan("REJECTED", "PENDING_RISK", "RESUBMIT")).toBe(false);
    expect(canTransitionLoan("DRAFT", "CANCELLED", "CANCEL")).toBe(true);
    expect(canTransitionLoan("RETURNED", "CANCELLED", "CANCEL")).toBe(true);
    expect(canTransitionLoan("REJECTED", "CANCELLED", "CANCEL")).toBe(true);
  });

  it("rejects backward jumps and locks terminal states", () => {
    expect(canTransitionLoan("CONTRACTED", "APPROVED", "CANCEL")).toBe(false);
    expect(() =>
      assertLoanTransition("CONTRACTED", "APPROVED", "CANCEL")
    ).toThrow("cannot move application");

    expect(isTerminalLoanStatus("REJECTED")).toBe(true);
    expect(getAvailableLoanActions("REJECTED")).toEqual(["CANCEL"]);

    for (const terminal of ["SETTLED", "CANCELLED", "COMPLETED"]) {
      expect(isTerminalLoanStatus(terminal)).toBe(true);
      expect(getAvailableLoanActions(terminal)).toEqual([]);
    }
  });
});
