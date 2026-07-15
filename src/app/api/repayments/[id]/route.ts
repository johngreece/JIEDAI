import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ensureActiveClientSession } from "@/lib/portal-session";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLogInTransaction } from "@/lib/audit";

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
  const repayment = await prisma.repayment.findUnique({
    where: { id },
    select: {
      id: true,
      repaymentNo: true,
      amount: true,
      status: true,
      matchComment: true,
      updatedAt: true,
      plan: {
        select: {
          applicationId: true,
        },
      },
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

  if (session.portal === "admin") {
    const adminSession = await requirePermission(["repayment:view"]);
    if (adminSession instanceof Response) return adminSession;
  } else if (session.portal === "client") {
    const activeClientSession = await ensureActiveClientSession(session);
    if (activeClientSession instanceof Response) return activeClientSession;

    const ownedApplication = await prisma.loanApplication.findFirst({
      where: {
        id: repayment.plan.applicationId,
        customerId: session.sub,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!ownedApplication) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    id: repayment.id,
    repaymentNo: repayment.repaymentNo,
    amount: Number(repayment.amount),
    status: repayment.status,
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
    },
  });

  if (!repayment) {
    return NextResponse.json({ error: "Repayment not found" }, { status: 404 });
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
