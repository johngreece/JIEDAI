import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLogInTransaction } from "@/lib/audit";
import { apiError, apiSuccess, ErrorCodes } from "@/lib/errors";
import { getScopedIdempotencyKey, withIdempotencyResponse } from "@/lib/idempotency";
import { parsePagination, paginatedResponse, toPrismaArgs } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { RestructureConflictError } from "@/lib/restructure-lifecycle";
import { generateRestructurePlan } from "@/lib/restructure-plan";
import { requirePermission } from "@/lib/rbac";
import {
  getRestructureCandidates,
  loadRestructurePlanSnapshot,
} from "@/services/restructure.service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requirePermission(["loan:view"]);
  if (session instanceof Response) return session;

  const url = new URL(req.url);
  if (url.searchParams.get("view") === "candidates") {
    const items = await getRestructureCandidates();
    return NextResponse.json({ items });
  }

  const pagination = parsePagination(url);
  const status = url.searchParams.get("status") ?? undefined;
  const applicationId = url.searchParams.get("applicationId") ?? undefined;
  const where = {
    ...(status ? { status } : {}),
    ...(applicationId ? { applicationId } : {}),
  };

  const [list, total] = await Promise.all([
    prisma.restructure.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...toPrismaArgs(pagination),
    }),
    prisma.restructure.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(list, total, pagination));
}

const createSchema = z.object({
  applicationId: z.string().min(1),
  newTermValue: z.number().int().min(1).max(360),
  newTermUnit: z.enum(["MONTH", "DAY"]).default("MONTH"),
  newRate: z.number().min(0).max(1),
  applyReason: z.string().trim().min(3).max(500),
});

export async function POST(req: Request) {
  const session = await requirePermission(["loan:create"]);
  if (session instanceof Response) return session;

  const idempotencyKey = getScopedIdempotencyKey(req, [
    "admin",
    session.sub,
    "restructure-create",
  ]);

  return withIdempotencyResponse(idempotencyKey, async () => {
    const body = await req.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(ErrorCodes.VALIDATION_ERROR, parsed.error.flatten());
    }

    try {
      const created = await prisma.$transaction(
        async (tx) => {
          const application = await tx.loanApplication.findUnique({
            where: { id: parsed.data.applicationId },
            select: { id: true, status: true },
          });
          if (!application) throw new Error("RESTRUCTURE_LOAN_NOT_FOUND");
          if (!["DISBURSED", "OVERDUE"].includes(application.status)) {
            throw new RestructureConflictError("仅已放款且未结清的借款可以重组");
          }

          const pending = await tx.restructure.findFirst({
            where: { applicationId: application.id, status: "PENDING" },
            select: { id: true },
          });
          if (pending) {
            throw new RestructureConflictError("该借款已有待审批的重组申请");
          }

          const activePlans = await tx.repaymentPlan.findMany({
            where: { applicationId: application.id, status: "ACTIVE" },
            select: { id: true },
            orderBy: { createdAt: "desc" },
            take: 2,
          });
          if (activePlans.length !== 1) {
            throw new RestructureConflictError("借款必须且只能有一份生效还款计划");
          }

          const { plan, balances } = await loadRestructurePlanSnapshot(
            tx,
            activePlans[0].id,
          );
          const projectedPlan = generateRestructurePlan({
            principal: balances.principal,
            carriedFee: balances.fee,
            newTermValue: parsed.data.newTermValue,
            newTermUnit: parsed.data.newTermUnit,
            newAnnualRate: parsed.data.newRate,
            startDate: new Date(),
          });

          const restructure = await tx.restructure.create({
            data: {
              applicationId: application.id,
              oldPlanId: plan.id,
              oldPlanVersion: plan.version,
              remainingPrincipal: balances.principal.toNumber(),
              remainingInterest: balances.interest.toNumber(),
              remainingFee: balances.fee.toNumber(),
              remainingPenalty: balances.penalty.toNumber(),
              projectedInterest: projectedPlan.totalInterest.toNumber(),
              newTermValue: parsed.data.newTermValue,
              newTermUnit: parsed.data.newTermUnit,
              newRate: parsed.data.newRate,
              applyReason: parsed.data.applyReason,
            },
          });

          await writeAuditLogInTransaction(tx, {
            userId: session.sub,
            action: "create",
            entityType: "restructure",
            entityId: restructure.id,
            newValue: {
              status: restructure.status,
              applicationId: application.id,
              oldPlanId: plan.id,
              oldPlanVersion: plan.version,
              remainingPrincipal: balances.principal.toString(),
              remainingInterest: balances.interest.toString(),
              remainingFee: balances.fee.toString(),
              remainingPenalty: balances.penalty.toString(),
              projectedInterest: projectedPlan.totalInterest.toString(),
              newTermValue: parsed.data.newTermValue,
              newTermUnit: parsed.data.newTermUnit,
              newRate: parsed.data.newRate,
            },
            changeSummary: "创建借款重组申请并固化权威余额快照",
          });

          return restructure;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      return apiSuccess({ id: created.id, status: created.status }, 201);
    } catch (error) {
      if (error instanceof Error && error.message === "RESTRUCTURE_LOAN_NOT_FOUND") {
        return apiError(ErrorCodes.LOAN_NOT_FOUND);
      }
      if (
        error instanceof RestructureConflictError ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
      ) {
        return apiError(ErrorCodes.CONFLICT, {
          reason: error instanceof Error ? error.message : undefined,
        });
      }
      console.error("[restructure-create]", error);
      return apiError(ErrorCodes.INTERNAL_ERROR);
    }
  });
}
