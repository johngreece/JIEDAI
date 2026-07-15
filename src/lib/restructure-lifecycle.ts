export const RESTRUCTURE_DECISION_ACTIONS = ["APPROVE", "REJECT"] as const;

export type RestructureDecisionAction = (typeof RESTRUCTURE_DECISION_ACTIONS)[number];
export type RestructureDecisionStatus = "APPROVED" | "REJECTED";

export function restructureDecisionStatus(
  action: RestructureDecisionAction,
): RestructureDecisionStatus {
  return action === "APPROVE" ? "APPROVED" : "REJECTED";
}

export class RestructureConflictError extends Error {
  constructor(message = "重组状态已变化，请刷新后重试") {
    super(message);
    this.name = "RestructureConflictError";
  }
}
