import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { InAppNotificationService } from "@/services/in-app-notification.service";
import {
  formatClientProfileCompletionError,
  getClientProfileCompletion,
  serializeClientProfileCompletion,
} from "@/lib/client-profile";
import {
  LoanTransitionConflictError,
  transitionLoanApplication,
} from "@/services/loan-transition.service";

export const dynamic = "force-dynamic";

const riskSchema = z.object({
  action: z.enum(["PASS", "RETURN", "REJECT"]),
  riskScore: z.number().min(0).max(100).optional(),
  comment: z.string().trim().max(500).optional(),
}).superRefine((input, context) => {
  if (input.action !== "PASS" && !input.comment) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["comment"],
      message: input.action === "RETURN" ? "退回原因不能为空" : "拒绝原因不能为空",
    });
  }
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["loan:risk"]);
  if (session instanceof Response) return session;

  const body = await req.json().catch(() => ({}));
  const parsed = riskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const input = parsed.data;

  const app = await prisma.loanApplication.findUnique({
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
  if (!app || app.deletedAt) {
    return NextResponse.json({ error: "申请不存在" }, { status: 404 });
  }
  if (app.status !== "PENDING_RISK") {
    return NextResponse.json({ error: "当前状态不允许风控审核" }, { status: 400 });
  }

  if (input.action === "PASS") {
    const profileCompletion = getClientProfileCompletion(app.customer);
    if (!profileCompletion.profileComplete) {
      return NextResponse.json(
        {
          error: formatClientProfileCompletionError(profileCompletion, "客户资料未完善，不能通过风控"),
          profileCompletion: serializeClientProfileCompletion(profileCompletion),
        },
        { status: 409 }
      );
    }
  }

  const nextStatus = input.action === "PASS"
    ? "PENDING_APPROVAL"
    : input.action === "RETURN"
      ? "RETURNED"
      : "REJECTED";
  const transitionAction = input.action === "PASS"
    ? "RISK_PASS"
    : input.action === "RETURN"
      ? "RISK_RETURN"
      : "RISK_REJECT";

  const updated = await prisma
    .$transaction(async (tx: Prisma.TransactionClient) => {
      const application = await transitionLoanApplication(tx, {
        applicationId: id,
        from: app.status,
        to: nextStatus,
        action: transitionAction,
        operatorId: session.sub,
        auditAction:
          input.action === "PASS" ? "approve" : input.action === "RETURN" ? "update" : "reject",
        changeSummary:
          input.action === "PASS"
            ? "Risk review passed"
            : input.action === "RETURN"
              ? "Risk review returned for supplement"
              : "Risk review rejected",
        data: {
          riskScore: input.riskScore,
          riskComment: input.comment ?? null,
          rejectedAt: input.action === "REJECT" ? new Date() : null,
          rejectedReason:
            input.action === "REJECT" ? (input.comment ?? "风控拒绝") : null,
        },
        auditNewValue: { riskScore: input.riskScore ?? null },
      });

      await tx.loanApproval.create({
        data: {
          applicationId: id,
          approverId: session.sub,
          action: transitionAction,
          comment: input.comment ?? null,
        },
      });

      return application;
    })
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

  const notificationType = input.action === "PASS"
    ? "LOAN_APPLICATION_UNDER_APPROVAL"
    : input.action === "RETURN"
      ? "LOAN_APPLICATION_RETURNED"
      : "LOAN_APPLICATION_REJECTED";
  await InAppNotificationService.notifyCustomer({
    customerId: app.customerId,
    type: notificationType,
    templateCode: `${notificationType}_${id}_${updated.updatedAt.toISOString()}`,
    title:
      input.action === "PASS"
        ? "借款申请已通过风控"
        : input.action === "RETURN"
          ? "借款申请已退回补件"
          : "借款申请未通过风控",
    content:
      input.action === "PASS"
        ? "你的借款申请已通过风控审核，当前进入待审批阶段，请留意后续审批结果。"
        : input.action === "RETURN"
          ? `你的借款申请已退回补件。原因：${input.comment}。请在“我的借款”中修改后重新提交。`
        : `你的借款申请未通过风控审核。原因：${input.comment}。如有需要，可重新发起一笔新申请。`,
  }).catch(() => undefined);

  return NextResponse.json({ id: updated.id, status: updated.status });
}
