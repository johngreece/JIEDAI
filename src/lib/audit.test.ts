import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { writeAuditLogInTransaction } from "./audit";

describe("transaction audit", () => {
  it("uses the supplied transaction client and serializes evidence", async () => {
    const create = vi.fn(
      async (_args: { data: Record<string, unknown> }) => ({ id: "audit-1" }),
    );
    const tx = {
      auditLog: { create },
    } as unknown as Prisma.TransactionClient;

    await writeAuditLogInTransaction(tx, {
      userId: "user-1",
      action: "confirm",
      entityType: "repayment",
      entityId: "repayment-1",
      oldValue: { status: "CUSTOMER_CONFIRMED" },
      newValue: { status: "CONFIRMED", amount: 10.5 },
      changeSummary: "Confirm repayment",
    });

    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0].data).toMatchObject({
      userId: "user-1",
      action: "confirm",
      entityType: "repayment",
      entityId: "repayment-1",
      oldValue: JSON.stringify({ status: "CUSTOMER_CONFIRMED" }),
      newValue: JSON.stringify({ status: "CONFIRMED", amount: 10.5 }),
    });
  });
});
