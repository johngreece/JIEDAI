import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { recordDisbursementLedger } from "@/services/ledger.service";
import { generateSchedule } from "@/services/schedule.service";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

function genPlanNo() {
  return `RP${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });
  }

  const { id } = await params;
  const current = await prisma.disbursement.findUnique({
    where: { id },
    include: { application: true },
  });

  if (!current) {
    return NextResponse.json({ error: "放款单不存在" }, { status: 404 });
  }
  if (current.status !== "PENDING") {
    return NextResponse.json({ error: "当前状态不允许确认打款" }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const disbursement = await tx.disbursement.update({
      where: { id },
      data: {
        status: "PAID",
        disbursedAt: new Date(),
        operatorId: session.sub,
      },
    });

    await tx.loanApplication.update({
      where: { id: disbursement.applicationId },
      data: { status: "DISBURSED" },
    });

    const existingPlan = await tx.repaymentPlan.findFirst({
      where: { applicationId: disbursement.applicationId },
      select: { id: true },
    });

    if (!existingPlan) {
      // 查询产品配置与定价规则
      const application = await tx.loanApplication.findUnique({
        where: { id: disbursement.applicationId },
        include: { product: { include: { pricingRules: { where: { isActive: true }, orderBy: { priority: "desc" } } } } },
      });

      // 从定价规则中获取利率（优先取 INTEREST 类型规则）
      let annualRate = 0;
      if (application?.product?.pricingRules?.length) {
        const interestRule = application.product.pricingRules.find(
          (r) => r.ruleType === "INTEREST" || r.ruleType === "BASE_RATE"
        ) ?? application.product.pricingRules[0];
        annualRate = Number(interestRule.rateValue);
      }

      const schedule = generateSchedule({
        principal: Number(disbursement.amount),
        termValue: application!.termValue,
        termUnit: (application!.termUnit as "MONTH" | "DAY"),
        repaymentMethod: (application!.product.repaymentMethod as "ONE_TIME" | "EQUAL_INSTALLMENT" | "EQUAL_PRINCIPAL"),
        annualRate,
        feeAmount: Number(disbursement.feeAmount),
        startDate: new Date(),
      });

      const plan = await tx.repaymentPlan.create({
        data: {
          planNo: genPlanNo(),
          applicationId: disbursement.applicationId,
          totalPrincipal: schedule.totalPrincipal.toNumber(),
          totalInterest: schedule.totalInterest.toNumber(),
          totalFee: schedule.totalFee.toNumber(),
          totalPeriods: schedule.totalPeriods,
          rulesSnapshotJson: JSON.stringify({ annualRate, repaymentMethod: application!.product.repaymentMethod }),
          status: "ACTIVE",
        },
      });

      for (const item of schedule.items) {
        await tx.repaymentScheduleItem.create({
          data: {
            planId: plan.id,
            periodNumber: item.periodNumber,
            dueDate: item.dueDate,
            principal: item.principal.toNumber(),
            interest: item.interest.toNumber(),
            fee: item.fee.toNumber(),
            totalDue: item.totalDue.toNumber(),
            remaining: item.totalDue.toNumber(),
            status: "PENDING",
          },
        });
      }
    }

    // 台账记账：放款
    await recordDisbursementLedger(tx, {
      disbursementId: disbursement.id,
      amount: disbursement.amount,
      feeAmount: disbursement.feeAmount,
      customerId: current.application.customerId,
      operatorId: session.sub,
    });

    // 更新资金账户余额
    await tx.fundAccount.update({
      where: { id: disbursement.fundAccountId },
      data: {
        balance: { decrement: disbursement.netAmount },
        totalOutflow: { increment: disbursement.netAmount },
      },
    });

    return disbursement;
  });

  await writeAuditLog({
    userId: session.sub,
    action: "disburse",
    entityType: "disbursement",
    entityId: id,
    oldValue: { status: current.status },
    newValue: { status: result.status, disbursedAt: result.disbursedAt?.toISOString() ?? null },
    changeSummary: "确认已打款",
  }).catch((e) => console.error("[AuditLog] confirm-paid", e));

  return NextResponse.json({ id: result.id, status: result.status });
}
