import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { checkIdempotencyKey, getScopedIdempotencyKey, saveIdempotencyResult } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  calculateLiveOutstandingFromSnapshot,
  extractPaidDates,
} from "@/lib/repayment-runtime";

export const dynamic = "force-dynamic";

const allocateSchema = z.object({
  allocations: z.array(
    z.object({
      itemId: z.string().min(1),
      amount: z.number().positive(),
      type: z.enum(["PRINCIPAL", "INTEREST", "FEE", "PENALTY"]).default("PRINCIPAL"),
    })
  ).min(1),
  comment: z.string().optional(),
});

type ScheduleItemLite = {
  id: string;
  periodNumber: number;
  remaining: unknown;
};

type AllocationInput = {
  itemId: string;
  amount: number;
  type: "PRINCIPAL" | "INTEREST" | "FEE" | "PENALTY";
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["repayment:allocate"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const idemKey = getScopedIdempotencyKey(req, ["admin", session.sub, "repayment-allocate", id]);
  const cached = await checkIdempotencyKey(idemKey);
  if (cached) return NextResponse.json(cached);

  const body = await req.json().catch(() => ({}));
  const parsed = allocateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数错误", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const input = parsed.data;

  const repayment = await prisma.repayment.findUnique({
    where: { id },
    include: { allocations: true },
  });

  if (!repayment) {
    return NextResponse.json({ error: "还款记录不存在" }, { status: 404 });
  }

  if (repayment.allocations.length > 0) {
    return NextResponse.json({ error: "该还款已分配，不能重复分配" }, { status: 400 });
  }

  if (!["PENDING", "MATCHED", "MANUAL_REVIEW"].includes(repayment.status)) {
    return NextResponse.json({ error: "当前状态不允许分配" }, { status: 400 });
  }

  const allocations = input.allocations as AllocationInput[];
  const itemIds = allocations.map((item) => item.itemId);
  const uniqueItemIds = [...new Set(itemIds)];

  const scheduleItems = await prisma.repaymentScheduleItem.findMany({
    where: { id: { in: uniqueItemIds }, planId: repayment.planId },
  });
  const typedScheduleItems = scheduleItems as ScheduleItemLite[];

  if (typedScheduleItems.length !== uniqueItemIds.length) {
    return NextResponse.json(
      { error: "存在无效期次，或期次不属于当前还款计划" },
      { status: 400 }
    );
  }

  const allocatedTotal = allocations.reduce((sum, item) => sum + item.amount, 0);
  if (allocatedTotal - Number(repayment.amount) > 0.000001) {
    return NextResponse.json({ error: "分配总额不能大于还款金额" }, { status: 400 });
  }

  const reservedAllocations = await prisma.repaymentAllocation.findMany({
    where: {
      itemId: { in: uniqueItemIds },
      repayment: {
        status: { in: ["PENDING_CONFIRM", "CUSTOMER_CONFIRMED"] },
      },
    },
    select: {
      itemId: true,
      amount: true,
    },
  });

  const reservedMap = new Map<string, number>();
  reservedAllocations.forEach((allocation) => {
    reservedMap.set(
      allocation.itemId,
      (reservedMap.get(allocation.itemId) || 0) + Number(allocation.amount)
    );
  });

  const itemMap = new Map<string, ScheduleItemLite>(
    typedScheduleItems.map((item) => [item.id, item])
  );

  const planContext = await prisma.repaymentPlan.findUnique({
    where: { id: repayment.planId },
    select: {
      applicationId: true,
      rulesSnapshotJson: true,
      version: true,
    },
  });
  const planApplication = planContext
    ? await prisma.loanApplication.findUnique({
        where: { id: planContext.applicationId },
        select: {
          amount: true,
          disbursement: {
            select: {
              disbursedAt: true,
            },
          },
        },
      })
    : null;

  const confirmedRepayments = await prisma.repayment.findMany({
    where: {
      planId: repayment.planId,
      status: "CONFIRMED",
    },
    select: { amount: true },
  });
  const confirmedAmount = confirmedRepayments.reduce((sum, item) => sum + Number(item.amount), 0);

  const singleOpenItem = typedScheduleItems.length === 1 ? typedScheduleItems[0] : null;
  let dynamicAvailableByItem = new Map<string, number>();

  if (planContext && planApplication && singleOpenItem) {
    const overdueRecord = await prisma.overdueRecord.findFirst({
      where: {
        scheduleItemId: singleOpenItem.id,
        status: "OVERDUE",
      },
      orderBy: { createdAt: "desc" },
      select: { overdueFeeDetail: true },
    });

    const liveOutstanding = calculateLiveOutstandingFromSnapshot({
      rulesSnapshotJson: planContext.rulesSnapshotJson,
      principal: Number(planApplication.amount),
      disbursedAt: planApplication.disbursement?.disbursedAt,
      paymentTime: repayment.receivedAt ?? new Date(),
      paidDates: extractPaidDates(overdueRecord?.overdueFeeDetail),
    });

    if (liveOutstanding != null) {
      dynamicAvailableByItem.set(
        singleOpenItem.id,
        Math.max(0, liveOutstanding - confirmedAmount),
      );
    }
  }

  const requestedByItem = new Map<string, number>();
  allocations.forEach((allocation) => {
    requestedByItem.set(
      allocation.itemId,
      (requestedByItem.get(allocation.itemId) || 0) + allocation.amount
    );
  });

  for (const [itemId, requestedAmount] of requestedByItem.entries()) {
    const scheduleItem = itemMap.get(itemId);
    if (!scheduleItem) continue;

    const remaining =
      dynamicAvailableByItem.get(itemId) ?? Number(scheduleItem.remaining);
    const reserved = reservedMap.get(itemId) || 0;
    const available = Math.max(0, remaining - reserved);

    if (requestedAmount - available > 0.000001) {
      return NextResponse.json(
        {
          error: `期次 ${scheduleItem.periodNumber} 可分配金额不足，当前可用 ${available.toFixed(2)}`,
        },
        { status: 400 }
      );
    }
  }

  const principalPart = allocations
    .filter((item) => item.type === "PRINCIPAL")
    .reduce((sum, item) => sum + item.amount, 0);
  const interestPart = allocations
    .filter((item) => item.type === "INTEREST")
    .reduce((sum, item) => sum + item.amount, 0);
  const feePart = allocations
    .filter((item) => item.type === "FEE")
    .reduce((sum, item) => sum + item.amount, 0);
  const penaltyPart = allocations
    .filter((item) => item.type === "PENALTY")
    .reduce((sum, item) => sum + item.amount, 0);

  let updated;
  try {
    updated = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        if (planContext) {
          const claimedPlan = await tx.repaymentPlan.updateMany({
            where: { id: repayment.planId, version: planContext.version },
            data: { version: { increment: 1 } },
          });
          if (claimedPlan.count !== 1) {
            throw new Error("PLAN_CHANGED");
          }
        }

        const claimedRepayment = await tx.repayment.updateMany({
          where: {
            id,
            status: { in: ["PENDING", "MATCHED", "MANUAL_REVIEW"] },
          },
          data: {
            principalPart,
            interestPart,
            feePart,
            penaltyPart,
            status: "PENDING_CONFIRM",
            matchComment: input.comment ?? "系统分配完成，等待客户确认付款",
          },
        });
        if (claimedRepayment.count !== 1) {
          throw new Error("REPAYMENT_STATUS_CHANGED");
        }

        const existingAllocation = await tx.repaymentAllocation.findFirst({
          where: { repaymentId: id },
          select: { id: true },
        });
        if (existingAllocation) {
          throw new Error("REPAYMENT_ALREADY_ALLOCATED");
        }

        const latestReservedAllocations = await tx.repaymentAllocation.findMany({
          where: {
            itemId: { in: uniqueItemIds },
            repaymentId: { not: id },
            repayment: {
              status: { in: ["PENDING_CONFIRM", "CUSTOMER_CONFIRMED"] },
            },
          },
          select: {
            itemId: true,
            amount: true,
          },
        });

        const latestReservedMap = new Map<string, number>();
        latestReservedAllocations.forEach((allocation) => {
          latestReservedMap.set(
            allocation.itemId,
            (latestReservedMap.get(allocation.itemId) || 0) + Number(allocation.amount)
          );
        });

        for (const [itemId, requestedAmount] of requestedByItem.entries()) {
          const scheduleItem = itemMap.get(itemId);
          if (!scheduleItem) continue;

          const remaining = dynamicAvailableByItem.get(itemId) ?? Number(scheduleItem.remaining);
          const reserved = latestReservedMap.get(itemId) || 0;
          const available = Math.max(0, remaining - reserved);

          if (requestedAmount - available > 0.000001) {
            throw new Error(`ALLOCATION_OVER_LIMIT:${scheduleItem.periodNumber}:${available.toFixed(2)}`);
          }
        }

        await tx.repaymentAllocation.createMany({
          data: allocations.map((allocation) => ({
            repaymentId: id,
            itemId: allocation.itemId,
            amount: allocation.amount,
            type: allocation.type,
          })),
        });

        return tx.repayment.findUniqueOrThrow({ where: { id } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "PLAN_CHANGED") {
      return NextResponse.json({ error: "还款计划已变化，请刷新后重试" }, { status: 409 });
    }
    if (message === "REPAYMENT_STATUS_CHANGED") {
      return NextResponse.json({ error: "还款状态已变化，请刷新后重试" }, { status: 409 });
    }
    if (message === "REPAYMENT_ALREADY_ALLOCATED") {
      return NextResponse.json({ error: "该还款已分配，不能重复分配" }, { status: 409 });
    }
    if (message.startsWith("ALLOCATION_OVER_LIMIT:")) {
      const [, periodNumber, available] = message.split(":");
      return NextResponse.json(
        { error: `期次 ${periodNumber} 可分配金额不足，当前可用 ${available}` },
        { status: 409 }
      );
    }
    console.error("[repayment-allocate]", error);
    return NextResponse.json({ error: "还款分配失败" }, { status: 500 });
  }

  await writeAuditLog({
    userId: session.sub,
    action: "update",
    entityType: "repayment",
    entityId: id,
    oldValue: {
      status: repayment.status,
      principalPart: Number(repayment.principalPart),
      interestPart: Number(repayment.interestPart),
      feePart: Number(repayment.feePart),
      penaltyPart: Number(repayment.penaltyPart),
    },
    newValue: {
      status: updated.status,
      principalPart: Number(updated.principalPart),
      interestPart: Number(updated.interestPart),
      feePart: Number(updated.feePart),
      penaltyPart: Number(updated.penaltyPart),
      allocatedTotal,
    },
    changeSummary: "还款分配完成，进入待客户确认付款状态",
  }).catch(() => undefined);

  const responseBody = {
    id: updated.id,
    status: updated.status,
    principalPart: Number(updated.principalPart),
    interestPart: Number(updated.interestPart),
    feePart: Number(updated.feePart),
    penaltyPart: Number(updated.penaltyPart),
  };
  await saveIdempotencyResult(idemKey, responseBody);

  return NextResponse.json(responseBody);
}
