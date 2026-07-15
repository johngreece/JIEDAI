import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  formatClientProfileCompletionError,
  getClientProfileCompletion,
  serializeClientProfileCompletion,
} from "@/lib/client-profile";
import { requirePermission } from "@/lib/rbac";
import {
  LoanTransitionConflictError,
  transitionLoanApplication,
} from "@/services/loan-transition.service";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["loan:create"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const application = await prisma.loanApplication.findUnique({
    where: { id },
    include: {
      customer: {
        select: {
          phone: true,
          address: true,
          taxNumber: true,
          idNumber: true,
          passportNumber: true,
          residencePermitNumber: true,
          residencePermitExpiry: true,
          profileCompletedAt: true,
          kyc: {
            select: {
              kycType: true,
              documentUrl: true,
              status: true,
              expiresAt: true,
            },
          },
        },
      },
    },
  });
  if (!application || application.deletedAt) {
    return NextResponse.json({ error: "申请不存在" }, { status: 404 });
  }

  if (!["DRAFT", "REJECTED"].includes(application.status)) {
    return NextResponse.json({ error: "当前状态不允许提交" }, { status: 400 });
  }

  const profileCompletion = getClientProfileCompletion(application.customer);
  if (!profileCompletion.profileComplete) {
    return NextResponse.json(
      {
        error: formatClientProfileCompletionError(profileCompletion, "客户资料未完善，不能提交风控"),
        profileCompletion: serializeClientProfileCompletion(profileCompletion),
      },
      { status: 409 }
    );
  }

  const updated = await prisma
    .$transaction((tx) =>
      transitionLoanApplication(tx, {
        applicationId: id,
        from: application.status,
        to: "PENDING_RISK",
        action: application.status === "REJECTED" ? "RESUBMIT" : "SUBMIT",
        operatorId: session.sub,
        auditAction: "update",
        changeSummary: "Submit application for risk review",
        data: {
          rejectedReason: null,
          rejectedAt: null,
        },
      })
    )
    .catch((error) => {
      if (error instanceof LoanTransitionConflictError) return null;
      throw error;
    });

  if (!updated) {
    return NextResponse.json(
      { error: "申请状态已变化，请刷新后重试" },
      { status: 409 }
    );
  }

  return NextResponse.json({ id: updated.id, status: updated.status });
}
