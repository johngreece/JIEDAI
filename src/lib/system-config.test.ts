import { describe, expect, it } from "vitest";
import { formatMoney, SYSTEM_CURRENCY, SYSTEM_TIME_ZONE } from "./system-config";

describe("system configuration", () => {
  it("keeps EUR and the operating timezone fixed", () => {
    expect(SYSTEM_CURRENCY).toBe("EUR");
    expect(SYSTEM_TIME_ZONE).toBe("Europe/Athens");
  });

  it("formats numbers and decimal-like values consistently", () => {
    expect(formatMoney(1234.5)).toContain("\u20AC");
    expect(formatMoney(1234.5)).toContain("1,234.50");
    expect(formatMoney({ toString: () => "-2.25" })).toContain("-\u20AC2.25");
  });

  it("rejects invalid financial values instead of hiding them as zero", () => {
    expect(() => formatMoney("not-a-number")).toThrow(TypeError);
    expect(() => formatMoney(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});
