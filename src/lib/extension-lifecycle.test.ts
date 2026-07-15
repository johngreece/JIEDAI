import { describe, expect, it } from "vitest";
import {
  allocateExtensionFeeShares,
  EXTENSION_DECISION_ACTIONS,
  extensionDecisionStatus,
} from "./extension-lifecycle";

describe("extension lifecycle", () => {
  it("uses command actions at the API boundary and maps them to stored statuses", () => {
    expect(EXTENSION_DECISION_ACTIONS).toEqual(["APPROVE", "REJECT"]);
    expect(extensionDecisionStatus("APPROVE")).toBe("APPROVED");
    expect(extensionDecisionStatus("REJECT")).toBe("REJECTED");
  });

  it("allocates the full four-decimal fee without dropping a rounding remainder", () => {
    const shares = allocateExtensionFeeShares("10.0000", 3);

    expect(shares.map((share) => share.toFixed(4))).toEqual([
      "3.3333",
      "3.3333",
      "3.3334",
    ]);
    expect(shares.reduce((sum, share) => sum.plus(share)).toFixed(4)).toBe("10.0000");
  });

  it("rejects fee allocation when no outstanding schedule remains", () => {
    expect(() => allocateExtensionFeeShares("10", 0)).toThrow(/at least one/);
  });
});
