import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { z } from "zod";
import { writeAuditLogInTransaction } from "@/lib/audit";
import { addCalendarMonths, addDays } from "@/lib/calendar-period";
import { apiError, apiSuccess, ErrorCodes } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  RESTRUCTURE_DECISION_ACTIONS,
  RestructureConflictError,
  restructureDecisionStatus,
} from "@/lib/restructure-lifecycle";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const approveSchema = z.object({
  action: z.enum(RESTRUCTURE_DECISION_ACTIONS),
  remark: z.string().optional(),
});

function genPlanNo() {
  return `RP${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function addTerm(value: number, unit: string) {
  return unit === "DAY" ? addDays(new Date(), value) : addCalendarMonths(new Date(), value);
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
            remark: parsed.data.remark ?? null,
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
            newValue: { status: targetStatus, remark: parsed.data.remark ?? null },
            changeSummary: "借款重组申请已拒绝",
          });
          return { record, oldPlanId: record.oldPlanId, newPlanId: null };
        }

        const activePlans = await tx.repaymentPlan.findMany({
          where: { applicationId: record.applicationId, status: "ACTIVE" },
          include: { scheduleItems: true },
          orderBy: { createdAt: "desc" },
          take: 2,
        });
        if (activePlans.length !== 1) {
          throw new RestructureConflictError("借款必须且只能有一份活跃还款计划");
        }
        const oldPlan = activePlans[0];
        if (record.oldPlanId && record.oldPlanId !== oldPlan.id) {
          throw new RestructureConflictError("重组申请对应的还款计划已发生变化");
        }

        const principal = new Decimal(record.remainingPrincipal.toString()).toDecimalPlaces(4);
        const interest = new Decimal(record.remainingInterest.toString()).toDecimalPlaces(4);
        const totalDue = principal.plus(interest).toDecimalPlaces(4);
        if (totalDue.lte(0)) {
          throw new RestructureConflictError("重组金额必须大于零");
        }
        const dueDate = addTerm(record.newTermValue, record.newTermUnit);

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
            totalPrincipal: principal.toNumber(),
            totalInterest: interest.toNumber(),
            totalFee: 0,
            totalPeriods: 1,
            status: "ACTIVE",
            version: oldPlan.version + 1,
            rulesSnapshotJson: JSON.stringify({
              restructureId: record.id,
              oldPlanId: oldPlan.id,
              remainingPrincipal: principal.toString(),
              remainingInterest: interest.toString(),
              newTermValue: record.newTermValue,
              newTermUnit: record.newTermUnit,
              newRate: record.newRate.toString(),
              dueDate: dueDate.toISOString(),
            }),
          },
        });

        await tx.repaymentScheduleItem.create({
          data: {
            planId: newPlan.id,
            periodNumber: 1,
            dueDate,
            principal: principal.toNumber(),
            interest: interest.toNumber(),
            fee: 0,
            totalDue: totalDue.toNumber(),
            remaining: totalDue.toNumber(),
            status: "PENDING",
          },
        });

        await writeAuditLogInTransaction(tx, {
          userId: session.sub,
          action: "approve",
          entityType: "restructure",
          entityId: record.id,
          oldValue: { status: "PENDING", planId: oldPlan.id },
          newValue: {
            status: targetStatus,
            planId: newPlan.id,
            principal: principal.toString(),
            interest: interest.toString(),
            dueDate: dueDate.toISOString(),
          },
          changeSummary: "借款重组审批通过并生成新还款计划",
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
