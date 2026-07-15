import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { z } from "zod";
import { writeAuditLogInTransaction } from "@/lib/audit";
import { apiError, apiSuccess, ErrorCodes } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  RESTRUCTURE_DECISION_ACTIONS,
  RestructureConflictError,
  restructureDecisionStatus,
} from "@/lib/restructure-lifecycle";
import {
  generateRestructurePlan,
  restructureBalancesMatch,
  type RestructureBalances,
} from "@/lib/restructure-plan";
import { requirePermission } from "@/lib/rbac";
import { loadRestructurePlanSnapshot } from "@/services/restructure.service";

export const dynamic = "force-dynamic";

const approveSchema = z.object({
  action: z.enum(RESTRUCTURE_DECISION_ACTIONS),
  remark: z.string().trim().max(500).optional(),
});

function genPlanNo() {
  return `RP${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function proposalBalances(record: {
  remainingPrincipal: Decimal.Value;
  remainingInterest: Decimal.Value;
  remainingFee: Decimal.Value;
  remainingPenalty: Decimal.Value;
}): RestructureBalances {
  return {
    principal: new Decimal(record.remainingPrincipal.toString()),
    interest: new Decimal(record.remainingInterest.toString()),
    fee: new Decimal(record.remainingFee.toString()),
    penalty: new Decimal(record.remainingPenalty.toString()),
  };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission(["loan:approve"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = approveSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(ErrorCodes.VALIDATION_ERROR, parsed.error.flatten());
  }

  const targetStatus = restructureDecisionStatus(parsed.data.action);
  const now = new Date();

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const claimed = await tx.restructure.updateMany({
          where: { id, status: "PENDING" },
          data: {
            status: targetStatus,
            remark: parsed.data.remark || null,
            approvedAt: targetStatus === "APPROVED" ? now : null,
          },
        });
        if (claimed.count !== 1) {
          const existing = await tx.restructure.findUnique({
            where: { id },
            select: { id: true },
          });
          if (!existing) throw new Error("RESTRUCTURE_NOT_FOUND");
          throw new RestructureConflictError();
        }

        const record = await tx.restructure.findUniqueOrThrow({ where: { id } });
        if (targetStatus === "REJECTED") {
          await writeAuditLogInTransaction(tx, {
            userId: session.sub,
            action: "reject",
            entityType: "restructure",
            entityId: record.id,
            oldValue: { status: "PENDING" },
            newValue: { status: targetStatus, remark: parsed.data.remark || null },
            changeSummary: "借款重组申请已拒绝",
          });
          return { record, oldPlanId: record.oldPlanId, newPlanId: null };
        }

        if (!record.oldPlanId) {
          throw new RestructureConflictError("重组申请缺少原还款计划快照，请重新申请");
        }
        if (record.newTermUnit !== "MONTH" && record.newTermUnit !== "DAY") {
          throw new RestructureConflictError("重组期限单位无效，请重新申请");
        }

        const { plan: oldPlan, balances } = await loadRestructurePlanSnapshot(
          tx,
          record.oldPlanId,
        );
        if (
          record.oldPlanId !== oldPlan.id ||
          record.oldPlanVersion !== oldPlan.version
        ) {
          throw new RestructureConflictError("原还款计划版本已变化，请重新申请");
        }
        if (!restructureBalancesMatch(proposalBalances(record), balances)) {
          throw new RestructureConflictError("待重组余额已变化，请刷新后重新申请");
        }

        const projectedPlan = generateRestructurePlan({
          principal: balances.principal,
          carriedFee: balances.fee,
          newTermValue: record.newTermValue,
          newTermUnit: record.newTermUnit,
          newAnnualRate: record.newRate,
          startDate: now,
        });
        if (!projectedPlan.totalInterest.eq(record.projectedInterest.toString())) {
          throw new RestructureConflictError("重组定价结果已变化，请重新申请");
        }

        const item = projectedPlan.items[0];
        if (!item || projectedPlan.items.length !== 1) {
          throw new RestructureConflictError("重组计划生成失败，请检查期限配置");
        }

        const newPlanId = randomUUID();
        const superseded = await tx.repaymentPlan.updateMany({
          where: { id: oldPlan.id, status: "ACTIVE", version: oldPlan.version },
          data: { status: "SUPERSEDED", supersededBy: newPlanId },
        });
        if (superseded.count !== 1) throw new RestructureConflictError();

        const newPlan = await tx.repaymentPlan.create({
          data: {
            id: newPlanId,
            planNo: genPlanNo(),
            applicationId: record.applicationId,
            totalPrincipal: projectedPlan.totalPrincipal.toNumber(),
            totalInterest: projectedPlan.totalInterest.toNumber(),
            totalFee: projectedPlan.totalFee.toNumber(),
            totalPeriods: projectedPlan.totalPeriods,
            status: "ACTIVE",
            version: oldPlan.version + 1,
            rulesSnapshotJson: JSON.stringify({
              source: "RESTRUCTURE",
              pricingModel: "FIXED_SCHEDULE",
              restructureId: record.id,
              oldPlanId: oldPlan.id,
              oldPlanVersion: oldPlan.version,
              oldOutstandingPrincipal: balances.principal.toString(),
              oldOutstandingInterest: balances.interest.toString(),
              oldOutstandingFee: balances.fee.toString(),
              oldOutstandingPenalty: balances.penalty.toString(),
              waivedInterest: balances.interest.toString(),
              waivedPenalty: balances.penalty.toString(),
              carriedFee: balances.fee.toString(),
              newAnnualRate: record.newRate.toString(),
              newTermValue: record.newTermValue,
              newTermUnit: record.newTermUnit,
              projectedInterest: projectedPlan.totalInterest.toString(),
              dueDate: item.dueDate.toISOString(),
            }),
          },
        });

        await tx.repaymentScheduleItem.create({
          data: {
            planId: newPlan.id,
            periodNumber: item.periodNumber,
            dueDate: item.dueDate,
            principal: item.principal.toNumber(),
            interest: item.interest.toNumber(),
            fee: item.fee.toNumber(),
            totalDue: item.totalDue.toNumber(),
            remaining: item.totalDue.toNumber(),
            remainingPrincipal: item.principal.toNumber(),
            remainingInterest: item.interest.toNumber(),
            remainingFee: item.fee.toNumber(),
            status: "PENDING",
          },
        });

        await writeAuditLogInTransaction(tx, {
          userId: session.sub,
          action: "approve",
          entityType: "restructure",
          entityId: record.id,
          oldValue: {
            status: "PENDING",
            planId: oldPlan.id,
            planVersion: oldPlan.version,
            outstandingPrincipal: balances.principal.toString(),
            outstandingInterest: balances.interest.toString(),
            outstandingFee: balances.fee.toString(),
            outstandingPenalty: balances.penalty.toString(),
          },
          newValue: {
            status: targetStatus,
            planId: newPlan.id,
            planVersion: newPlan.version,
            principal: projectedPlan.totalPrincipal.toString(),
            interest: projectedPlan.totalInterest.toString(),
            fee: projectedPlan.totalFee.toString(),
            waivedInterest: balances.interest.toString(),
            waivedPenalty: balances.penalty.toString(),
            dueDate: item.dueDate.toISOString(),
          },
          changeSummary: "借款重组审批通过，按新利率生成还款计划并留存余额处理规则",
        });

        return { record, oldPlanId: oldPlan.id, newPlanId: newPlan.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return apiSuccess({
      id: result.record.id,
      status: result.record.status,
      oldPlanId: result.oldPlanId,
      newPlanId: result.newPlanId,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "RESTRUCTURE_NOT_FOUND") {
      return apiError(ErrorCodes.RESTR_NOT_FOUND);
    }
    if (
      error instanceof RestructureConflictError ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
    ) {
      return apiError(ErrorCodes.CONFLICT, {
        reason: error instanceof Error ? error.message : undefined,
      });
    }
    console.error("[restructure-approve]", error);
    return apiError(ErrorCodes.INTERNAL_ERROR);
  }
}
