import Decimal from "decimal.js";

export const EXTENSION_DECISION_ACTIONS = ["APPROVE", "REJECT"] as const;

export type ExtensionDecisionAction = (typeof EXTENSION_DECISION_ACTIONS)[number];
export type ExtensionDecisionStatus = "APPROVED" | "REJECTED";

export function extensionDecisionStatus(
  action: ExtensionDecisionAction,
): ExtensionDecisionStatus {
  return action === "APPROVE" ? "APPROVED" : "REJECTED";
}

export function allocateExtensionFeeShares(
  totalFee: Decimal.Value,
  itemCount: number,
): Decimal[] {
  if (!Number.isInteger(itemCount) || itemCount <= 0) {
    throw new Error("Extension fee requires at least one outstanding schedule item");
  }

  const total = new Decimal(totalFee).toDecimalPlaces(4);
  const standardShare = total.div(itemCount).toDecimalPlaces(4);
  let allocated = new Decimal(0);

  return Array.from({ length: itemCount }, (_, index) => {
    const share = index === itemCount - 1 ? total.minus(allocated) : standardShare;
    allocated = allocated.plus(share);
    return share;
  });
}
