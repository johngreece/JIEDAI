import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function occurrenceCount(source: string, pattern: RegExp) {
  return source.match(pattern)?.length ?? 0;
}

describe("portal object data scope guard", () => {
  it("scopes customer contract reads and signing claims before object state is exposed", () => {
    const detail = readSource("src/app/api/contracts/[id]/route.ts");
    const signing = readSource("src/app/api/contracts/[id]/sign/route.ts");

    expect(detail).toContain("prisma.contract.findFirst({");
    expect(detail).toContain("customerId: session.sub");
    expect(detail).not.toContain("prisma.contract.findUnique({");

    expect(signing).toContain("prisma.contract.findFirst({");
    expect(signing).not.toContain("prisma.contract.findUnique({");
    expect(occurrenceCount(signing, /customerId: session\.sub/g)).toBeGreaterThanOrEqual(2);
  });

  it("scopes client loan, disbursement, and repayment reads by owned applications", () => {
    const realtime = readSource(
      "src/app/api/loan-applications/[id]/realtime/route.ts",
    );
    const disbursement = readSource(
      "src/app/api/client/disbursements/[id]/confirm-received/route.ts",
    );
    const repayment = readSource("src/app/api/repayments/[id]/route.ts").split(
      "export async function DELETE",
    )[0];

    expect(realtime).toContain("prisma.loanApplication.findFirst({");
    expect(realtime).toContain("customerId: session.sub");
    expect(realtime).not.toContain("prisma.loanApplication.findUnique({");

    expect(disbursement).toContain("prisma.disbursement.findFirst({");
    expect(occurrenceCount(disbursement, /customerId: session\.sub/g)).toBeGreaterThanOrEqual(2);
    expect(disbursement).not.toContain("prisma.disbursement.findUnique({");

    expect(repayment).toContain("prisma.repayment.findFirst({");
    expect(repayment).toContain("plan: { applicationId: { in: ownedApplicationIds } }");
    expect(repayment).not.toContain("prisma.repayment.findUnique({");
  });

  it("repeats customer scope in the atomic repayment confirmation claim", () => {
    const repaymentConfirmation = readSource("src/lib/repayment-confirm.ts").split(
      "export async function settleRepaymentReceipt",
    )[0];

    expect(repaymentConfirmation).toContain("prisma.repayment.findFirst({");
    expect(repaymentConfirmation).toContain("tx.repayment.updateMany({");
    expect(
      occurrenceCount(
        repaymentConfirmation,
        /plan: \{ applicationId: \{ in: ownedApplicationIds \} \}/g,
      ),
    ).toBeGreaterThanOrEqual(2);
  });

  it("scopes returned loan resubmission to the active client and atomic transition", () => {
    const resubmit = readSource(
      "src/app/api/client/loan-applications/[id]/resubmit/route.ts",
    );

    expect(resubmit).toContain("requireActiveClientSession()");
    expect(resubmit).toContain("prisma.loanApplication.findFirst({");
    expect(resubmit).toContain("customerId: session.sub");
    expect(resubmit).toContain('application.status !== "RETURNED"');
    expect(resubmit).toContain("transitionLoanApplication(tx");
    expect(resubmit).toContain('from: "RETURNED"');
    expect(resubmit).toContain('action: "RESUBMIT"');
    expect(resubmit).not.toContain("prisma.loanApplication.findUnique({");
  });

  it("uses a funder-scoped service lookup for funder contract details", () => {
    const route = readSource("src/app/api/funder/contracts/[id]/route.ts");
    const service = readSource("src/services/funder-contract.service.ts");

    expect(route).toContain("FunderContractService.getForFunder(id, funderSession.sub)");
    expect(service).toContain("static async getForFunder(contractId: string, funderId: string)");
    expect(service).toContain("where: { id: contractId, funderId }");
  });

  it("authorizes private KYC and financial proof downloads by object ownership", () => {
    const customerDocument = readSource(
      "src/app/api/customer-documents/[id]/file/route.ts",
    );
    const attachment = readSource("src/app/api/attachments/[id]/file/route.ts");

    expect(customerDocument).toContain('requirePermission(["customer:view"])');
    expect(customerDocument).toContain("customerId: session.sub");
    expect(customerDocument).toContain("ensureActiveClientSession(session)");

    expect(attachment).toContain('attachment.entityType === "funder_withdrawal"');
    expect(attachment).toContain('? "withdrawal:view"');
    expect(attachment).toContain('attachment.entityType === "capital_inflow"');
    expect(attachment).toContain('? "inflow:view"');
    expect(attachment).toContain("requirePermission([requiredPermission])");
    expect(attachment).toContain("ensureActiveFunderSession(session)");
    expect(attachment).toContain("ensureActiveClientSession(session)");
    expect(attachment).toContain("fundAccount: { funderId: session.sub }");
    expect(attachment).toContain(
      'entityType: { in: ["capital_inflow", "disbursement", "funder_withdrawal", "repayment"] }',
    );
    expect(attachment).toContain("prisma.capitalInflow.findFirst({");
    expect(attachment).toContain("prisma.disbursement.findFirst({");
    expect(attachment).toContain("prisma.funderWithdrawal.findFirst({");
    expect(attachment).toContain("prisma.repayment.findFirst({");
    expect(attachment).toContain("customerId: session.sub");
    expect(attachment).toContain('attachment.entityType !== "repayment"');
    expect(attachment).toContain("funderId: session.sub");
  });
});
