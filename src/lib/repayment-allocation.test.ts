import { describe, expect, it } from "vitest";

import {
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
