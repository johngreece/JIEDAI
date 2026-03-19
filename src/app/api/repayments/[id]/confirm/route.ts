/**
 * POST /api/repayments/:id/confirm
 * 确认还款 → PENDING_CONFIRM → CONFIRMED
 * 写入台账 + 更新还款计划 + 解除逾期 + 回收资金
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { recordRepaymentLedger } from "@/services/ledger.service";
import { resolveOverdue } from "@/services/overdue.service";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });
  }

  const { id } = await params;

  const repayment = await prisma.repayment.findUnique({
    where: { id },
    include: {
      plan: {
        include: {
          scheduleItems: true,
        },
      },
    },
  });

  if (!repayment) {
    return NextResponse.json({ error: "还款记录不存在" }, { status: 404 });
  }
  if (repayment.status !== "PENDING_CONFIRM") {
    return NextResponse.json(
      { error: `当前状态 ${repayment.status} 不允许确认` },
      { status: 400 }
    );
  }

  // 获取 applicationId 和 customerId
  const application = await prisma.loanApplication.findFirst({
    where: {
      id: repayment.plan.applicationId,
    },
    include: {
      disbursement: { select: { fundAccountId: true } },
    },
  });

  if (!application) {
    return NextResponse.json({ error: "关联借款申请不存在" }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // 1. 更新还款状态 → CONFIRMED
    const updated = await tx.repayment.update({
      where: { id },
      data: {
        status: "CONFIRMED",
        receivedAt: new Date(),
      },
    });

    // 2. 台账记账：还款入账
    await recordRepaymentLedger(tx, {
      repaymentId: id,
      principalPart: repayment.principalPart,
      interestPart: repayment.interestPart,
      feePart: repayment.feePart,
      penaltyPart: repayment.penaltyPart,
      customerId: application.customerId,
      operatorId: session.sub,
    });

    // 3. 检查是否全部期次已还清 → 更新还款计划状态
    const allPaid = repayment.plan.scheduleItems.every(
      (item) => item.status === "PAID" || Number(item.remaining) <= 0.0001
    );

    if (allPaid) {
      await tx.repaymentPlan.update({
        where: { id: repayment.planId },
        data: { status: "COMPLETED" },
      });

      // 更新借款申请为已结清
      await tx.loanApplication.update({
        where: { id: application.id },
        data: { status: "SETTLED" },
      });
    }

    // 4. 解除相关逾期记录
    for (const item of repayment.plan.scheduleItems) {
      if (item.status === "PAID" || Number(item.remaining) <= 0.0001) {
        await resolveOverdue(item.id);
      }
    }

    // 5. 回收资金到资金账户
    if (application.disbursement?.fundAccountId) {
      await tx.fundAccount.update({
        where: { id: application.disbursement.fundAccountId },
        data: {
          balance: { increment: Number(repayment.amount) },
          totalProfit: {
            increment:
              Number(repayment.interestPart) +
              Number(repayment.feePart) +
              Number(repayment.penaltyPart),
          },
        },
      });
    }

    return updated;
  });

  await writeAuditLog({
    userId: session.sub,
    action: "confirm",
    entityType: "repayment",
    entityId: id,
    oldValue: { status: repayment.status },
    newValue: { status: result.status },
    changeSummary: `确认还款 ${Number(repayment.amount)} 元`,
  }).catch((e) => console.error("[AuditLog] repayment-confirm", e));

  return NextResponse.json({
    id: result.id,
    status: result.status,
    receivedAt: result.receivedAt?.toISOString() ?? null,
  });
}
