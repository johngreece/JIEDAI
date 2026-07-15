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
import { formatMoney as money } from "@/lib/system-config";
import {
  LoanTransitionConflictError,
  transitionLoanApplication,
} from "@/services/loan-transition.service";

export const dynamic = "force-dynamic";

const approveSchema = z.object({
  action: z.enum(["APPROVE", "RETURN", "REJECT"]),
  approvedAmount: z.number().positive().optional(),
  comment: z.string().trim().max(500).optional(),
}).superRefine((input, context) => {
  if (input.action !== "APPROVE" && !input.comment) {
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
  const session = await requirePermission(["loan:approve"]);
  if (session instanceof Response) return session;

  const body = await req.json().catch(() => ({}));
  const parsed = approveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const input = parsed.data;

  const app = await prisma.loanApplication.findUnique({
    where: { id },
    include: {
      product: { select: { name: true } },
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
  if (app.status !== "PENDING_APPROVAL") {
    return NextResponse.json({ error: "当前状态不允许审批" }, { status: 400 });
  }

  if (input.action === "APPROVE") {
    const profileCompletion = getClientProfileCompletion(app.customer);
    if (!profileCompletion.profileComplete) {
      return NextResponse.json(
        {
          error: formatClientProfileCompletionError(profileCompletion, "客户资料未完善，不能审批通过"),
          profileCompletion: serializeClientProfileCompletion(profileCompletion),
        },
        { status: 409 }
      );
    }
  }

  const approvedAmount = input.approvedAmount ?? Number(app.amount);

  const nextStatus = input.action === "APPROVE"
    ? "APPROVED"
    : input.action === "RETURN"
      ? "RETURNED"
      : "REJECTED";
  const transitionAction = input.action === "APPROVE"
    ? "APPROVE"
    : input.action === "RETURN"
      ? "APPROVAL_RETURN"
      : "APPROVAL_REJECT";
  const updated = await prisma
    .$transaction(async (tx: Prisma.TransactionClient) => {
      const application = await transitionLoanApplication(tx, {
        applicationId: id,
        from: app.status,
        to: nextStatus,
        action: transitionAction,
        operatorId: session.sub,
        auditAction:
          input.action === "APPROVE" ? "approve" : input.action === "RETURN" ? "update" : "reject",
        changeSummary:
          input.action === "APPROVE"
            ? "Application approved"
            : input.action === "RETURN"
              ? "Application returned for supplement"
              : "Application rejected",
        data: {
          approvedAt: input.action === "APPROVE" ? new Date() : null,
          totalApprovedAmount: input.action === "APPROVE" ? approvedAmount : null,
          rejectedAt: input.action === "REJECT" ? new Date() : null,
          rejectedReason:
            input.action === "REJECT" ? (input.comment ?? "审批拒绝") : null,
        },
        auditNewValue: {
          totalApprovedAmount:
            input.action === "APPROVE" ? String(approvedAmount) : null,
        },
      });

      await tx.loanApproval.create({
        data: {
          applicationId: id,
          approverId: session.sub,
          action: transitionAction,
          approvedAmount: input.action === "APPROVE" ? approvedAmount : null,
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

  const notificationType = input.action === "APPROVE"
    ? "LOAN_APPLICATION_APPROVED"
    : input.action === "RETURN"
      ? "LOAN_APPLICATION_RETURNED"
      : "LOAN_APPLICATION_REJECTED";
  await InAppNotificationService.notifyCustomer({
    customerId: app.customerId,
    type: notificationType,
    templateCode: `${notificationType}_${id}_${updated.updatedAt.toISOString()}`,
    title:
      input.action === "APPROVE"
        ? "借款申请已审批通过"
        : input.action === "RETURN"
          ? "借款申请已退回补件"
          : "借款申请被拒绝",
    content:
      input.action === "APPROVE"
        ? `你的借款申请已审批通过，产品 ${app.product.name}，审批金额 ${money(approvedAmount)}。请留意后续合同与放款提醒。`
        : input.action === "RETURN"
          ? `你的借款申请已退回补件。原因：${input.comment}。请在“我的借款”中修改后重新提交。`
          : `你的借款申请已被拒绝。原因：${input.comment}。如有需要，可重新发起一笔新申请。`,
  }).catch(() => undefined);

  return NextResponse.json({ id: updated.id, status: updated.status });
}
