import { NextResponse } from "next/server";
import { z } from "zod";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { apiError, apiSuccess, ErrorCodes } from "@/lib/errors";

export const dynamic = "force-dynamic";

const approveSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  remark: z.string().optional(),
});

function genPlanNo() {
  return `RP${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function addTerm(value: number, unit: string) {
  const dueDate = new Date();
  if (unit === "DAY") {
    dueDate.setDate(dueDate.getDate() + value);
  } else {
    dueDate.setMonth(dueDate.getMonth() + value);
  }
  return dueDate;
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
    return apiError(ErrorCodes.VALIDATION_ERROR);
  }

  const record = await prisma.restructure.findUnique({ where: { id } });
  if (!record) {
    return apiError(ErrorCodes.RESTR_NOT_FOUND);
  }
  if (record.status !== "PENDING") {
    return apiError(ErrorCodes.EXT_BAD_STATUS);
  }

  if (parsed.data.action === "REJECT") {
    const rejected = await prisma.restructure.update({
      where: { id },
      data: {
        status: "REJECTED",
        remark: parsed.data.remark ?? null,
        approvedAt: null,
      },
    });
    return apiSuccess({ id: rejected.id, status: rejected.status });
  }

  const oldPlan = record.oldPlanId
    ? await prisma.repaymentPlan.findUnique({
        where: { id: record.oldPlanId },
        include: { scheduleItems: true },
      })
    : await prisma.repaymentPlan.findFirst({
        where: { applicationId: record.applicationId, status: "ACTIVE" },
        include: { scheduleItems: true },
        orderBy: { createdAt: "desc" },
      });

  if (!oldPlan) {
    return NextResponse.json(
      { error: "No active repayment plan found for restructure approval" },
      { status: 409 },
    );
  }

  const principal = new Decimal(record.remainingPrincipal.toString()).toDecimalPlaces(4);
  const interest = new Decimal(record.remainingInterest.toString()).toDecimalPlaces(4);
  const totalDue = principal.plus(interest).toDecimalPlaces(4);
  const dueDate = addTerm(record.newTermValue, record.newTermUnit);

  const result = await prisma.$transaction(async (tx) => {
    const newPlan = await tx.repaymentPlan.create({
      data: {
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

    await tx.repaymentPlan.update({
      where: { id: oldPlan.id },
      data: {
        status: "SUPERSEDED",
        supersededBy: newPlan.id,
      },
    });

    const updated = await tx.restructure.update({
      where: { id },
      data: {
        status: "APPROVED",
        oldPlanId: oldPlan.id,
        remark: parsed.data.remark ?? null,
        approvedAt: new Date(),
      },
    });

    return { updated, newPlan };
  });

  return apiSuccess({
    id: result.updated.id,
    status: result.updated.status,
    oldPlanId: oldPlan.id,
    newPlanId: result.newPlan.id,
  });
}
