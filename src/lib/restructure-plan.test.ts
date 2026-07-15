import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculateRestructureBalances,
  generateRestructurePlan,
  restructureBalancesMatch,
} from "./restructure-plan";

describe("restructure plan", () => {
  it("uses persisted component balances and outstanding penalties", () => {
    const balances = calculateRestructureBalances(
      [
        {
          remaining: 730,
          remainingPrincipal: 600,
          remainingInterest: 100,
          remainingFee: 30,
        },
        {
          remaining: 210,
          remainingPrincipal: 200,
          remainingInterest: 10,
          remainingFee: 0,
        },
      ],
      [12.3456, 7.6544],
    );

    expect(balances.principal.toString()).toBe("800");
    expect(balances.interest.toString()).toBe("110");
    expect(balances.fee.toString()).toBe("30");
    expect(balances.penalty.toString()).toBe("20");
  });

  it("fails closed when an open schedule item has no component balances", () => {
    expect(() =>
      calculateRestructureBalances([
        {
          remaining: 100,
          remainingPrincipal: 0,
          remainingInterest: 0,
          remainingFee: 0,
        },
      ]),
    ).toThrow("missing component balances");
  });

  it("recalculates one-time interest from the proposed annual rate and term", () => {
    const plan = generateRestructurePlan({
      principal: 1200,
      carriedFee: 25,
      newTermValue: 6,
      newTermUnit: "MONTH",
      newAnnualRate: 0.12,
      startDate: new Date("2026-01-31T12:00:00.000Z"),
    });

    expect(plan.totalPrincipal.toString()).toBe("1200");
    expect(plan.totalInterest.toString()).toBe("72");
    expect(plan.totalFee.toString()).toBe("25");
    expect(plan.items[0].totalDue.toString()).toBe("1297");
  });

  it("compares every snapshotted balance component", () => {
    const base = {
      principal: new Decimal(100),
      interest: new Decimal(10),
      fee: new Decimal(2),
      penalty: new Decimal(1),
    };

    expect(restructureBalancesMatch(base, { ...base })).toBe(true);
    expect(
      restructureBalancesMatch(base, {
        ...base,
        penalty: new Decimal(2),
      }),
    ).toBe(false);
  });
});
