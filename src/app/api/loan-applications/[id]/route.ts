import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { RiskIntelligenceService } from "@/services/risk-intelligence.service";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  amount: z.number().positive().optional(),
  termValue: z.number().int().positive().optional(),
  termUnit: z.string().min(1).optional(),
  purpose: z.string().optional(),
  remark: z.string().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["loan:view"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const data = await prisma.loanApplication.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, phone: true, idNumber: true } },
      product: { select: { id: true, name: true } },
      approvals: {
        orderBy: { createdAt: "desc" },
        include: { approver: { select: { id: true, username: true, realName: true } } },
      },
      disbursement: {
        select: { id: true, disbursementNo: true, status: true, amount: true, netAmount: true },
      },
      contracts: {
        where: { contractType: "MAIN", deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          contractNo: true,
          status: true,
          createdAt: true,
          signedAt: true,
          variableData: true,
        },
      },
    },
  });

  if (!data || data.deletedAt) {
    return NextResponse.json({ error: "申请不存在" }, { status: 404 });
  }

  const mainContract = data.contracts[0] || null;
  const recommendedRisk = await RiskIntelligenceService.getApplicationRecommendation(id);
  let contractGenerationOptions: Record<string, unknown> | null = null;
  if (mainContract?.variableData) {
    try {
      const parsed = JSON.parse(mainContract.variableData);
      contractGenerationOptions = parsed.contractGenerationOptions ?? null;
    } catch {
      contractGenerationOptions = null;
    }
  }

  return NextResponse.json({
    id: data.id,
    applicationNo: data.applicationNo,
    status: data.status,
    amount: Number(data.amount),
    termValue: data.termValue,
    termUnit: data.termUnit,
    purpose: data.purpose,
    remark: data.remark,
    riskScore: data.riskScore ? Number(data.riskScore) : null,
    riskComment: data.riskComment,
    approvedAt: data.approvedAt,
    totalApprovedAmount: data.totalApprovedAmount ? Number(data.totalApprovedAmount) : null,
    rejectedAt: data.rejectedAt,
    rejectedReason: data.rejectedReason,
    customer: data.customer,
    product: data.product,
    approvals: data.approvals.map((approval) => ({
      id: approval.id,
      action: approval.action,
      comment: approval.comment,
      approvedAmount: approval.approvedAmount ? Number(approval.approvedAmount) : null,
      createdAt: approval.createdAt,
      approver: approval.approver,
    })),
    disbursement: data.disbursement
      ? {
          ...data.disbursement,
          amount: Number(data.disbursement.amount),
          netAmount: Number(data.disbursement.netAmount),
        }
      : null,
    recommendedRisk,
    mainContract: mainContract
      ? {
          id: mainContract.id,
          contractNo: mainContract.contractNo,
          status: mainContract.status,
          createdAt: mainContract.createdAt,
          signedAt: mainContract.signedAt,
          contractGenerationOptions,
        }
      : null,
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["loan:create"]);
  if (session instanceof Response) return session;

  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数错误", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { id } = await params;
  const app = await prisma.loanApplication.findUnique({ where: { id } });
  if (!app || app.deletedAt) {
    return NextResponse.json({ error: "申请不存在" }, { status: 404 });
  }

  if (!["DRAFT", "REJECTED"].includes(app.status)) {
    return NextResponse.json({ error: "当前状态不允许编辑" }, { status: 400 });
  }

  const input = parsed.data;
  const updated = await prisma.loanApplication.update({
    where: { id },
    data: {
      amount: input.amount ?? undefined,
      termValue: input.termValue ?? undefined,
      termUnit: input.termUnit ?? undefined,
      purpose: input.purpose ?? undefined,
      remark: input.remark ?? undefined,
    },
  });

  await writeAuditLog({
    userId: session.sub,
    action: "update",
    entityType: "loan_application",
    entityId: id,
    oldValue: {
      amount: Number(app.amount),
      termValue: app.termValue,
      termUnit: app.termUnit,
      purpose: app.purpose,
      remark: app.remark,
    },
    newValue: {
      amount: Number(updated.amount),
      termValue: updated.termValue,
      termUnit: updated.termUnit,
      purpose: updated.purpose,
      remark: updated.remark,
    },
    changeSummary: "编辑借款申请",
  }).catch(() => undefined);

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    amount: Number(updated.amount),
    termValue: updated.termValue,
    termUnit: updated.termUnit,
    purpose: updated.purpose,
    remark: updated.remark,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["loan:create"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const app = await prisma.loanApplication.findUnique({
    where: { id },
    include: {
      disbursement: { select: { id: true, status: true } },
      contracts: {
        where: { deletedAt: null },
        select: { id: true, status: true },
      },
    },
  });

  if (!app || app.deletedAt) {
    return NextResponse.json({ error: "申请不存在" }, { status: 404 });
  }

  const hasRepaymentPlan = await prisma.repaymentPlan.findFirst({
    where: { applicationId: id },
    select: { id: true },
  });

  if (app.disbursement || hasRepaymentPlan) {
    return NextResponse.json({ error: "该申请已进入放款/还款流程，不能直接删除" }, { status: 409 });
  }

  const activeContract = app.contracts.find((item) => item.status !== "CANCELLED");
  if (activeContract) {
    return NextResponse.json({ error: "该申请已有合同记录，不能直接删除" }, { status: 409 });
  }

  await prisma.loanApplication.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await writeAuditLog({
    userId: session.sub,
    action: "delete",
    entityType: "loan_application",
    entityId: id,
    oldValue: {
      applicationNo: app.applicationNo,
      status: app.status,
      amount: Number(app.amount),
    },
    changeSummary: "删除借款申请",
  }).catch(() => undefined);

  return NextResponse.json({ success: true });
}
