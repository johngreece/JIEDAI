import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const riskSchema = z.object({
  action: z.enum(["PASS", "REJECT"]),
  riskScore: z.number().min(0).max(100).optional(),
  comment: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = riskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const input = parsed.data;

  const app = await prisma.loanApplication.findUnique({ where: { id } });
  if (!app || app.deletedAt) {
    return NextResponse.json({ error: "申请不存在" }, { status: 404 });
  }
  if (app.status !== "PENDING_RISK") {
    return NextResponse.json({ error: "当前状态不允许风控审核" }, { status: 400 });
  }

  const nextStatus = input.action === "PASS" ? "PENDING_APPROVAL" : "REJECTED";

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const application = await tx.loanApplication.update({
      where: { id },
      data: {
        status: nextStatus,
        riskScore: input.riskScore,
        riskComment: input.comment ?? null,
        rejectedAt: input.action === "REJECT" ? new Date() : null,
        rejectedReason: input.action === "REJECT" ? (input.comment ?? "风控拒绝") : null,
      },
    });

    await tx.loanApproval.create({
      data: {
        applicationId: id,
        approverId: session.sub,
        action: input.action === "PASS" ? "RISK_PASS" : "RISK_REJECT",
        comment: input.comment ?? null,
      },
    });

    return application;
  });

  await writeAuditLog({
    userId: session.sub,
    action: input.action === "PASS" ? "approve" : "reject",
    entityType: "loan_application",
    entityId: id,
    oldValue: { status: app.status },
    newValue: { status: updated.status, riskScore: updated.riskScore?.toString() ?? null },
    changeSummary: input.action === "PASS" ? "风控通过" : "风控拒绝",
  }).catch(() => undefined);

  return NextResponse.json({ id: updated.id, status: updated.status });
}
