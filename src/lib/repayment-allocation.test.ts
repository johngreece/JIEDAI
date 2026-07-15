import { describe, expect, it } from "vitest";

import {
  deriveRepaymentOpenComponents,
  formatRepaymentAllocationComponentError,
  parseRepaymentAllocationComponentError,
  serializeRepaymentAllocationComponentError,
  validateRepaymentAllocationComponentCaps,
  type RepaymentAllocationScheduleItem,
} from "@/lib/repayment-allocation";

const item: RepaymentAllocationScheduleItem = {
  id: "item-1",
  periodNumber: 1,
  principal: 10000,
  interest: 0,
  fee: 500,
  remaining: 10500,
};

function itemMap(row = item) {
  return new Map([[row.id, row]]);
}

describe("repayment allocation component caps", () => {
  it("reduces a tiered fee before treating the remainder as penalty", () => {
    const components = deriveRepaymentOpenComponents(
      {
        remainingPrincipal: 1000,
        remainingInterest: 0,
        remainingFee: 50,
      },
      1020,
    );

    expect(components).toEqual({
      principal: 1000,
      interest: 0,
      fee: 20,
      penalty: 0,
    });
  });

  it("enforces the current tier fee instead of the maximum scheduled fee", () => {
    const dynamicItem = {
      ...item,
      principal: 1000,
      fee: 50,
      remaining: 1050,
      remainingPrincipal: 1000,
      remainingInterest: 0,
      remainingFee: 50,
    };
    const components = deriveRepaymentOpenComponents(dynamicItem, 1020);
    const error = validateRepaymentAllocationComponentCaps({
      allocations: [{ itemId: dynamicItem.id, type: "FEE", amount: 21 }],
      itemMap: itemMap(dynamicItem),
      dynamicAvailableByItem: new Map([[dynamicItem.id, 1020]]),
      dynamicComponentsByItem: new Map([[dynamicItem.id, components]]),
      confirmedRows: [],
      pendingRows: [],
    });

    expect(error).toMatchObject({ type: "FEE", available: 20 });
  });

  it("allows repayment components within principal, fee, and realtime penalty caps", () => {
    const error = validateRepaymentAllocationComponentCaps({
      allocations: [
        { itemId: "item-1", type: "FEE", amount: 500 },
        { itemId: "item-1", type: "PRINCIPAL", amount: 10000 },
        { itemId: "item-1", type: "PENALTY", amount: 210 },
      ],
      itemMap: itemMap(),
      dynamicAvailableByItem: new Map([["item-1", 10710]]),
      confirmedRows: [],
      pendingRows: [],
    });

    expect(error).toBeNull();
  });

  it("rejects allocating more interest than the schedule interest cap", () => {
    const error = validateRepaymentAllocationComponentCaps({
      allocations: [{ itemId: "item-1", type: "INTEREST", amount: 1 }],
      itemMap: itemMap(),
      dynamicAvailableByItem: new Map([["item-1", 10710]]),
      confirmedRows: [],
      pendingRows: [],
    });

    expect(error).toMatchObject({
      code: "ALLOCATION_COMPONENT_OVER_LIMIT",
      periodNumber: 1,
      type: "INTEREST",
      available: 0,
    });
  });

  it("subtracts confirmed and pending allocations from each component cap", () => {
    const error = validateRepaymentAllocationComponentCaps({
      allocations: [{ itemId: "item-1", type: "FEE", amount: 200 }],
      itemMap: itemMap(),
      dynamicAvailableByItem: new Map(),
      confirmedRows: [{ itemId: "item-1", type: "FEE", amount: 200 }],
      pendingRows: [{ itemId: "item-1", type: "FEE", amount: 200 }],
    });

    expect(error).toMatchObject({
      type: "FEE",
      available: 100,
    });
  });

  it("serializes and formats component errors for API transaction retries", () => {
    const serialized = serializeRepaymentAllocationComponentError({
      code: "ALLOCATION_COMPONENT_OVER_LIMIT",
      periodNumber: 2,
      type: "PRINCIPAL",
      available: 123.456,
    });
    const parsed = parseRepaymentAllocationComponentError(serialized);

    expect(serialized).toBe("ALLOCATION_COMPONENT_OVER_LIMIT:2:PRINCIPAL:123.46");
    expect(parsed).toEqual({
      code: "ALLOCATION_COMPONENT_OVER_LIMIT",
      periodNumber: 2,
      type: "PRINCIPAL",
      available: 123.46,
    });
    expect(parsed ? formatRepaymentAllocationComponentError(parsed) : "").toBe(
      "期次 2 的本金可分配金额不足，当前可用 123.46"
    );
  });
});
