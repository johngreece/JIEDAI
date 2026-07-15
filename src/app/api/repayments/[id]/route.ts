import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ensureActiveClientSession } from "@/lib/portal-session";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLogInTransaction } from "@/lib/audit";
import {
  appendRepaymentConfirmationEvidence,
  REPAYMENT_CONFIRMATION_EVIDENCE_ACTION,
} from "@/services/repayment-confirmation-evidence.service";
import { serializeProofAttachment } from "@/lib/proof-attachment";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let ownedApplicationIds: string[] | null = null;
  if (session.portal === "admin") {
    const adminSession = await requirePermission(["repayment:view"]);
    if (adminSession instanceof Response) return adminSession;
  } else if (session.portal === "client") {
    const activeClientSession = await ensureActiveClientSession(session);
    if (activeClientSession instanceof Response) return activeClientSession;

    const ownedApplications = await prisma.loanApplication.findMany({
      where: { customerId: session.sub, deletedAt: null },
      select: { id: true },
    });
    ownedApplicationIds = ownedApplications.map((application) => application.id);
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const repayment = await prisma.repayment.findFirst({
    where:
      ownedApplicationIds === null
        ? { id }
        : { id, plan: { applicationId: { in: ownedApplicationIds } } },
    select: {
      id: true,
      repaymentNo: true,
      amount: true,
      status: true,
      paymentMethod: true,
      transactionId: true,
      payerBank: true,
      payerAccount: true,
      matchComment: true,
      updatedAt: true,
      confirmation: {
        select: {
          status: true,
          rejectReason: true,
          confirmedAt: true,
        },
      },
    },
  });

  if (!repayment) {
    return NextResponse.json({ error: "Repayment not found" }, { status: 404 });
  }

  const proof = await prisma.attachment.findFirst({
    where: {
      entityType: "repayment",
      entityId: repayment.id,
      category: "REPAYMENT_PAYMENT_PROOF",
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      fileUrl: true,
      fileSize: true,
      mimeType: true,
      category: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    id: repayment.id,
    repaymentNo: repayment.repaymentNo,
    amount: Number(repayment.amount),
    status: repayment.status,
    paymentMethod: repayment.paymentMethod,
    transactionId: repayment.transactionId,
    payerBank: repayment.payerBank,
    payerAccount: repayment.payerAccount,
    proof: proof ? serializeProofAttachment(proof) : null,
    matchComment: repayment.matchComment,
    rejectReason: repayment.confirmation?.rejectReason ?? null,
    updatedAt: repayment.updatedAt,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission(["repayment:allocate"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const repayment = await prisma.repayment.findUnique({
    where: { id },
    include: {
      allocations: { select: { id: true } },
      confirmation: { select: { id: true } },
      plan: { select: { applicationId: true } },
    },
  });

  if (!repayment) {
    return NextResponse.json({ error: "Repayment not found" }, { status: 404 });
  }

  const application = await prisma.loanApplication.findUnique({
    where: { id: repayment.plan.applicationId },
    select: { customerId: true },
  });
  if (!application) {
    return NextResponse.json({ error: "Loan application not found" }, { status: 404 });
  }

  if (repayment.status === "CONFIRMED") {
    return NextResponse.json({ error: "Confirmed repayments cannot be cancelled" }, { status: 409 });
  }

  if (repayment.status === "CANCELLED") {
    return NextResponse.json({ error: "Repayment already cancelled" }, { status: 409 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.repayment.updateMany({
        where: { id, status: repayment.status },
        data: {
          status: "CANCELLED",
          matchComment: "Cancelled by operator before receipt confirmation",
        },
      });
      if (claimed.count !== 1) {
        throw new Error("REPAYMENT_STATUS_CHANGED");
      }

      if (repayment.confirmation) {
        await tx.repaymentConfirmation.update({
          where: { repaymentId: id },
          data: {
            status: "REJECTED",
            rejectReason: "Repayment record cancelled by operator before receipt confirmation",
            confirmedAt: null,
          },
        });

        await appendRepaymentConfirmationEvidence(tx, {
          repaymentId: id,
          customerId: application.customerId,
          actorType: "ADMIN",
          actorId: session.sub,
          action: REPAYMENT_CONFIRMATION_EVIDENCE_ACTION.ADMIN_CANCELLED,
          fromStatus: repayment.status,
          toStatus: "CANCELLED",
          confirmedAmount: repayment.amount,
          reason: "Repayment record cancelled by operator before receipt confirmation",
          occurredAt: new Date(),
          details: { repaymentNo: repayment.repaymentNo },
        });
      }

      await writeAuditLogInTransaction(tx, {
        userId: session.sub,
        action: "cancel",
        entityType: "repayment",
        entityId: id,
        oldValue: {
          repaymentNo: repayment.repaymentNo,
          status: repayment.status,
          amount: Number(repayment.amount),
          allocationCount: repayment.allocations.length,
        },
        newValue: { status: "CANCELLED" },
        changeSummary: "Cancel repayment record before receipt confirmation",
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "REPAYMENT_STATUS_CHANGED") {
      return NextResponse.json(
        { error: "Repayment status changed, please refresh and retry" },
        { status: 409 },
      );
    }
    throw error;
  }

  return NextResponse.json({ success: true, status: "CANCELLED" });
}
