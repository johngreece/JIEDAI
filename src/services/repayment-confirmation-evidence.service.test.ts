import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  appendRepaymentConfirmationEvidence,
  REPAYMENT_CONFIRMATION_EVIDENCE_ACTION,
} from "./repayment-confirmation-evidence.service";

describe("repayment confirmation evidence", () => {
  it("binds amount, signature, actor, transition, and details into the evidence hash", async () => {
    const create = vi.fn(async ({ data }) => ({ id: "event-1", ...data }));
    const tx = {
      repaymentConfirmationEvent: { create },
    } as unknown as Prisma.TransactionClient;
    const signatureData = "data:image/png;base64,c2lnbmF0dXJl";
    const occurredAt = new Date("2026-07-15T08:30:00.000Z");

    await appendRepaymentConfirmationEvidence(tx, {
      repaymentId: "repayment-1",
      customerId: "customer-1",
      actorType: "CLIENT",
      actorId: "customer-1",
      action: REPAYMENT_CONFIRMATION_EVIDENCE_ACTION.CLIENT_DECLARED_PAID,
      fromStatus: "PENDING_CONFIRM",
      toStatus: "CUSTOMER_CONFIRMED",
      confirmedAmount: "123.45",
      signatureData,
      ipAddress: "127.0.0.1",
      deviceInfo: "test-agent",
      occurredAt,
      details: { repaymentNo: "RP-001" },
    });

    const data = create.mock.calls[0][0].data;
    const parsed = JSON.parse(data.evidenceJson);
    expect(parsed).toMatchObject({
      repaymentId: "repayment-1",
      actorType: "CLIENT",
      action: "CLIENT_DECLARED_PAID",
      fromStatus: "PENDING_CONFIRM",
      toStatus: "CUSTOMER_CONFIRMED",
      confirmedAmount: "123.4500",
      occurredAt: occurredAt.toISOString(),
      details: { repaymentNo: "RP-001" },
    });
    expect(parsed.signatureSha256).toBe(
      createHash("sha256").update(signatureData).digest("hex"),
    );
    expect(data.evidenceHash).toBe(
      createHash("sha256").update(data.evidenceJson).digest("hex"),
    );
  });

  it("keeps amount submission and overdue resolution inside the guarded workflow", () => {
    const root = process.cwd();
    const page = readFileSync(
      path.join(root, "src/app/client/(main)/sign/repayment/[id]/page.tsx"),
      "utf8",
    );
    const route = readFileSync(
      path.join(root, "src/app/api/client/repayments/[id]/confirm/route.ts"),
      "utf8",
    );
    const workflow = readFileSync(path.join(root, "src/lib/repayment-confirm.ts"), "utf8");
    const overdueService = readFileSync(
      path.join(root, "src/services/overdue.service.ts"),
      "utf8",
    );

    expect(page).toContain("confirmedAmount,");
    expect(route).toContain("confirmedAmount: confirmedAmountSchema.optional()");
    expect(route).toContain("confirmedAmount: parsed.data.confirmedAmount");
    expect(workflow).toContain("submittedAmount.equals(repayment.amount)");
    expect(workflow).toContain("appendRepaymentConfirmationEvidence(tx, {");
    expect(workflow).toContain("resolveOverdue(item.id, tx)");
    expect(overdueService).toContain("db: OverdueWriteClient = prisma");
    expect(overdueService).toContain("db.overdueRecord.updateMany({");
  });
});
