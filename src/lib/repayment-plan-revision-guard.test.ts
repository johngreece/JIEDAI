import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("repayment plan revision guards", () => {
  it("keeps extension decisions and plan replacement in one guarded transaction", () => {
    const service = source("src/services/extension.service.ts");
    const route = source("src/app/api/extensions/[id]/approve/route.ts");
    const page = source("src/app/admin/(main)/extensions/page.tsx");

    expect(route).toContain("z.enum(EXTENSION_DECISION_ACTIONS)");
    expect(page).toContain("ExtensionDecisionAction");
    expect(service).toContain("tx.extension.updateMany");
    expect(service).toContain('status: "PENDING"');
    expect(service).toContain("tx.repaymentPlan.updateMany");
    expect(service).toContain('status: "ACTIVE", version: oldPlan.version');
    expect(service).toContain("TransactionIsolationLevel.Serializable");
    expect(service).toContain("writeAuditLogInTransaction(tx");
    expect(service).not.toContain("tx.repaymentPlan.update({");
  });

  it("guards restructure creation and approval against stale active plans", () => {
    const createRoute = source("src/app/api/restructures/route.ts");
    const approveRoute = source("src/app/api/restructures/[id]/approve/route.ts");

    expect(createRoute).toContain("TransactionIsolationLevel.Serializable");
    expect(createRoute).toContain("withIdempotencyResponse");
    expect(createRoute).toContain("loadRestructurePlanSnapshot");
    expect(createRoute).toContain("oldPlanVersion: plan.version");
    expect(createRoute).toContain("projectedInterest: projectedPlan.totalInterest");
    expect(createRoute).toContain("writeAuditLogInTransaction(tx");
    expect(createRoute).not.toContain("remainingPrincipal: z.number");
    expect(createRoute).not.toContain("remainingInterest: z.number");
    expect(approveRoute).toContain("tx.restructure.updateMany");
    expect(approveRoute).toContain("record.oldPlanVersion !== oldPlan.version");
    expect(approveRoute).toContain("restructureBalancesMatch");
    expect(approveRoute).toContain("generateRestructurePlan");
    expect(approveRoute).toContain("projectedPlan.totalInterest.eq");
    expect(approveRoute).toContain("tx.repaymentPlan.updateMany");
    expect(approveRoute).toContain('status: "ACTIVE", version: oldPlan.version');
    expect(approveRoute).toContain("remainingPrincipal: item.principal");
    expect(approveRoute).toContain("remainingInterest: item.interest");
    expect(approveRoute).toContain("remainingFee: item.fee");
    expect(approveRoute).toContain("TransactionIsolationLevel.Serializable");
    expect(approveRoute).toContain("writeAuditLogInTransaction(tx");
    expect(approveRoute).not.toContain("tx.repaymentPlan.update({");
  });
});
