import { describe, expect, it, vi } from "vitest";
import {
  type DailyMaintenanceDependencies,
  runDailyMaintenance,
} from "./daily-maintenance.service";

function dependenciesFor(order: string[]): DailyMaintenanceDependencies {
  return {
    scanOverdue: vi.fn(async () => order.push("overdue")),
    generateFunderInterestSettlements: vi.fn(async () => order.push("settlements")),
    scanClientNotifications: vi.fn(async () => order.push("client")),
    scanFunderNotifications: vi.fn(async () => order.push("funder")),
    processMessageRetryQueue: vi.fn(async () => order.push("retry")),
  };
}

describe("daily maintenance", () => {
  it("runs the free-tier maintenance stages in business order", async () => {
    const order: string[] = [];
    const result = await runDailyMaintenance(dependenciesFor(order));

    expect(result.success).toBe(true);
    expect(order).toEqual(["overdue", "settlements", "client", "funder", "retry"]);
    expect(result.stages.every((stage) => stage.status === "success")).toBe(true);
  });

  it("continues after a failed stage and reports a failed summary", async () => {
    const order: string[] = [];
    const dependencies = dependenciesFor(order);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    dependencies.generateFunderInterestSettlements = vi.fn(async () => {
      order.push("settlements");
      throw new Error("settlement unavailable");
    });

    const result = await runDailyMaintenance(dependencies);

    expect(result.success).toBe(false);
    expect(order).toEqual(["overdue", "settlements", "client", "funder", "retry"]);
    expect(result.stages[1]).toMatchObject({
      name: "funderInterestSettlements",
      status: "failed",
      error: "settlement unavailable",
    });
    expect(result.stages[4].status).toBe("success");
    expect(errorLog).toHaveBeenCalledOnce();
    errorLog.mockRestore();
  });
});
