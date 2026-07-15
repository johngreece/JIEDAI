import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function parseEvidenceJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["disbursement:view"]);
  if (session instanceof Response) return session;

  const { id } = await params;

  const disbursement = await prisma.disbursement.findUnique({
    where: { id },
    include: {
      application: {
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          product: { select: { id: true, name: true } },
        },
      },
      fundAccount: {
        include: { funder: { select: { id: true, name: true } } },
      },
    },
  });

  if (!disbursement) {
    return NextResponse.json({ error: "放款单不存在" }, { status: 404 });
  }

  const plan = await prisma.repaymentPlan.findFirst({
    where: { applicationId: disbursement.applicationId },
    orderBy: { createdAt: "desc" },
  });

  const scheduleItems = plan
    ? await prisma.repaymentScheduleItem.findMany({
        where: { planId: plan.id },
        orderBy: { periodNumber: "asc" },
      })
    : [];

  return NextResponse.json({
    id: disbursement.id,
    disbursementNo: disbursement.disbursementNo,
    status: disbursement.status,
    amount: Number(disbursement.amount),
    feeAmount: Number(disbursement.feeAmount),
    netAmount: Number(disbursement.netAmount),
    disbursedAt: disbursement.disbursedAt,
    customerConfirmation: {
      confirmedAt: disbursement.customerConfirmedAt,
      ipAddress: disbursement.customerConfirmIp,
      userAgent: disbursement.customerConfirmUserAgent,
      evidence: parseEvidenceJson(disbursement.customerConfirmEvidenceJson),
    },
    remark: disbursement.remark,
    application: {
      id: disbursement.application.id,
      applicationNo: disbursement.application.applicationNo,
      status: disbursement.application.status,
      customer: disbursement.application.customer,
      product: disbursement.application.product,
    },
    fundAccount: {
      id: disbursement.fundAccount.id,
      accountName: disbursement.fundAccount.accountName,
      bankName: disbursement.fundAccount.bankName,
      accountNo: disbursement.fundAccount.accountNo,
      balance: Number(disbursement.fundAccount.balance),
      funder: disbursement.fundAccount.funder,
    },
    repaymentPlan: plan
      ? {
          id: plan.id,
          planNo: plan.planNo,
          totalPrincipal: Number(plan.totalPrincipal),
          totalInterest: Number(plan.totalInterest),
          totalFee: Number(plan.totalFee),
          totalPeriods: plan.totalPeriods,
          status: plan.status,
          items: scheduleItems.map((x: {
            id: string;
            periodNumber: number;
            dueDate: Date;
            principal: unknown;
            interest: unknown;
            fee: unknown;
            totalDue: unknown;
            remaining: unknown;
            status: string;
          }) => ({
            id: x.id,
            periodNumber: x.periodNumber,
            dueDate: x.dueDate,
            principal: Number(x.principal),
            interest: Number(x.interest),
            fee: Number(x.fee),
            totalDue: Number(x.totalDue),
            remaining: Number(x.remaining),
            status: x.status,
          })),
        }
      : null,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["disbursement:create"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const disbursement = await prisma.disbursement.findUnique({
    where: { id },
    include: {
      application: {
        select: {
          id: true,
          applicationNo: true,
          status: true,
        },
      },
    },
  });

  if (!disbursement) {
    return NextResponse.json({ error: "放款单不存在" }, { status: 404 });
  }

  if (disbursement.status !== "PENDING") {
    return NextResponse.json({ error: "只有待打款的放款单才允许删除" }, { status: 409 });
  }

  const repaymentPlan = await prisma.repaymentPlan.findFirst({
    where: { applicationId: disbursement.applicationId },
    select: { id: true },
  });

  if (repaymentPlan) {
    return NextResponse.json({ error: "该放款单已关联还款计划，不能直接删除" }, { status: 409 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.disbursement.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: "CANCELLED",
          remark: disbursement.remark
            ? `${disbursement.remark}\nCancelled by operator before payment`
            : "Cancelled by operator before payment",
        },
      });

      if (claimed.count !== 1) {
        throw new Error("DISBURSEMENT_STATUS_CHANGED");
      }

      await tx.auditLog.create({
        data: {
          userId: session.sub,
          action: "cancel",
          entityType: "disbursement",
          entityId: id,
          oldValue: JSON.stringify({
            disbursementNo: disbursement.disbursementNo,
            status: disbursement.status,
            amount: Number(disbursement.amount),
            applicationNo: disbursement.application.applicationNo,
          }),
          newValue: JSON.stringify({
            status: "CANCELLED",
            applicationStatus: disbursement.application.status,
          }),
          changeSummary: "Cancel pending disbursement before payment",
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DISBURSEMENT_STATUS_CHANGED") {
      return NextResponse.json(
        { error: "Disbursement status changed, please refresh and retry" },
        { status: 409 },
      );
    }
    throw error;
  }

  return NextResponse.json({
    success: true,
    status: "CANCELLED",
    applicationStatus: disbursement.application.status,
  });
}
