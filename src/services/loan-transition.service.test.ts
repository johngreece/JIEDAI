import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  LoanTransitionConflictError,
  transitionLoanApplication,
} from "./loan-transition.service";

function fakeTransaction(options?: { claimed?: number }) {
  const updated = {
    id: "loan-1",
    status: "PENDING_RISK",
    updatedAt: new Date(),
  };
  const tx = {
    loanApplication: {
      updateMany: vi.fn(async () => ({ count: options?.claimed ?? 1 })),
      findUniqueOrThrow: vi.fn(async () => updated),
    },
    auditLog: {
      create: vi.fn(async (_args: { data: Record<string, unknown> }) => ({ id: "audit-1" })),
    },
  };

  return { tx: tx as unknown as Prisma.TransactionClient, raw: tx, updated };
}

describe("loan transition service", () => {
  it("claims the expected status and writes the audit in the same client", async () => {
    const { tx, raw, updated } = fakeTransaction();

    const result = await transitionLoanApplication(tx, {
      applicationId: "loan-1",
      from: "DRAFT",
      to: "PENDING_RISK",
      action: "SUBMIT",
      operatorId: "user-1",
      auditAction: "update",
      changeSummary: "Submit application",
      data: { rejectedAt: null, rejectedReason: null },
    });

    expect(result).toBe(updated);
    expect(raw.loanApplication.updateMany).toHaveBeenCalledWith({
      where: { id: "loan-1", status: "DRAFT", deletedAt: null },
      data: { rejectedAt: null, rejectedReason: null, status: "PENDING_RISK" },
    });
    expect(raw.auditLog.create).toHaveBeenCalledOnce();
    expect(raw.auditLog.create.mock.calls[0][0].data).toMatchObject({
      userId: "user-1",
      entityType: "loan_application",
      entityId: "loan-1",
    });
  });

  it("does not audit when another request has already changed the status", async () => {
    const { tx, raw } = fakeTransaction({ claimed: 0 });

    await expect(
      transitionLoanApplication(tx, {
        applicationId: "loan-1",
        from: "DRAFT",
        to: "PENDING_RISK",
        action: "SUBMIT",
        operatorId: "user-1",
        auditAction: "update",
        changeSummary: "Submit application",
      })
    ).rejects.toBeInstanceOf(LoanTransitionConflictError);

    expect(raw.loanApplication.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(raw.auditLog.create).not.toHaveBeenCalled();
  });

  it("uses domain evidence instead of AuditLog for non-user portal actors", async () => {
    const { tx, raw } = fakeTransaction();

    await transitionLoanApplication(tx, {
      applicationId: "loan-1",
      from: "APPROVED",
      to: "CONTRACTED",
      action: "SIGN_CONTRACT",
      auditAction: "sign",
      changeSummary: "Main contract signed with signature evidence",
    });

    expect(raw.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects an illegal transition before touching the database", async () => {
    const { tx, raw } = fakeTransaction();

    await expect(
      transitionLoanApplication(tx, {
        applicationId: "loan-1",
        from: "CONTRACTED",
        to: "APPROVED",
        action: "CANCEL",
        operatorId: "user-1",
        auditAction: "cancel",
        changeSummary: "Invalid rollback",
      })
    ).rejects.toThrow("cannot move application");

    expect(raw.loanApplication.updateMany).not.toHaveBeenCalled();
  });
});
