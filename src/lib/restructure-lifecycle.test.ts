import { describe, expect, it } from "vitest";
import {
  RESTRUCTURE_DECISION_ACTIONS,
  restructureDecisionStatus,
} from "./restructure-lifecycle";

describe("restructure lifecycle", () => {
  it("maps approval commands to persisted statuses", () => {
    expect(RESTRUCTURE_DECISION_ACTIONS).toEqual(["APPROVE", "REJECT"]);
    expect(restructureDecisionStatus("APPROVE")).toBe("APPROVED");
    expect(restructureDecisionStatus("REJECT")).toBe("REJECTED");
  });
});
