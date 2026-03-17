import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

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
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });
  }

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
    },
  });

  if (!data || data.deletedAt) {
    return NextResponse.json({ error: "申请不存在" }, { status: 404 });
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
    approvals: data.approvals.map((a: {
      id: string;
      action: string;
      comment: string | null;
      approvedAmount: unknown;
      createdAt: Date;
      approver: { id: string; username: string; realName: string };
    }) => ({
      id: a.id,
      action: a.action,
      comment: a.comment,
      approvedAmount: a.approvedAmount ? Number(a.approvedAmount) : null,
      createdAt: a.createdAt,
      approver: a.approver,
    })),
    disbursement: data.disbursement
      ? {
          ...data.disbursement,
          amount: Number(data.disbursement.amount),
          netAmount: Number(data.disbursement.netAmount),
        }
      : null,
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
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
