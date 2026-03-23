import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { InAppNotificationService } from "@/services/in-app-notification.service";

export const dynamic = "force-dynamic";

const approveSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  approvedAmount: z.number().positive().optional(),
  comment: z.string().optional(),
});

function money(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

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
    },
  });
  if (!app || app.deletedAt) {
    return NextResponse.json({ error: "申请不存在" }, { status: 404 });
  }
  if (app.status !== "PENDING_APPROVAL") {
    return NextResponse.json({ error: "当前状态不允许审批" }, { status: 400 });
  }

  const approvedAmount = input.approvedAmount ?? Number(app.amount);

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const application = await tx.loanApplication.update({
      where: { id },
      data: {
        status: input.action === "APPROVE" ? "APPROVED" : "REJECTED",
        approvedAt: input.action === "APPROVE" ? new Date() : null,
        totalApprovedAmount: input.action === "APPROVE" ? approvedAmount : null,
        rejectedAt: input.action === "REJECT" ? new Date() : null,
        rejectedReason: input.action === "REJECT" ? (input.comment ?? "审批拒绝") : null,
      },
    });

    await tx.loanApproval.create({
      data: {
        applicationId: id,
        approverId: session.sub,
        action: input.action,
        approvedAmount: input.action === "APPROVE" ? approvedAmount : null,
        comment: input.comment ?? null,
      },
    });

    return application;
  });

  await writeAuditLog({
    userId: session.sub,
    action: input.action === "APPROVE" ? "approve" : "reject",
    entityType: "loan_application",
    entityId: id,
    oldValue: { status: app.status },
    newValue: {
      status: updated.status,
      totalApprovedAmount: updated.totalApprovedAmount?.toString() ?? null,
    },
    changeSummary: input.action === "APPROVE" ? "审批通过" : "审批拒绝",
  }).catch(() => undefined);

  await InAppNotificationService.notifyCustomer({
    customerId: app.customerId,
    type: input.action === "APPROVE" ? "LOAN_APPLICATION_APPROVED" : "LOAN_APPLICATION_REJECTED",
    templateCode: `${input.action === "APPROVE" ? "LOAN_APPLICATION_APPROVED" : "LOAN_APPLICATION_REJECTED"}_${id}_${updated.updatedAt.toISOString()}`,
    title: input.action === "APPROVE" ? "借款申请已审批通过" : "借款申请被拒绝",
    content:
      input.action === "APPROVE"
        ? `你的借款申请已审批通过，产品 ${app.product.name}，审批金额 ${money(approvedAmount)}。请留意后续合同与放款提醒。`
        : `你的借款申请已被拒绝。${input.comment ? `原因：${input.comment}` : "如需再次申请，可调整后重新提交。"}`,
  }).catch(() => undefined);

  return NextResponse.json({ id: updated.id, status: updated.status });
}
