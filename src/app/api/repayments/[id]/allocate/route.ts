import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

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

  const body = await req.json().catch(() => ({}));
  const parsed = allocateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数错误", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { id } = await params;
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

  if (!["PENDING", "MATCHED"].includes(repayment.status)) {
    return NextResponse.json({ error: "当前状态不允许分配" }, { status: 400 });
  }

  const allocations = input.allocations as AllocationInput[];
  const itemIds = allocations.map((item) => item.itemId);

  const scheduleItems = await prisma.repaymentScheduleItem.findMany({
    where: { id: { in: itemIds }, planId: repayment.planId },
  });
  const typedScheduleItems = scheduleItems as ScheduleItemLite[];

  if (typedScheduleItems.length !== itemIds.length) {
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
      itemId: { in: itemIds },
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

  for (const allocation of allocations) {
    const scheduleItem = itemMap.get(allocation.itemId);
    if (!scheduleItem) continue;

    const remaining = Number(scheduleItem.remaining);
    const reserved = reservedMap.get(allocation.itemId) || 0;
    const available = Math.max(0, remaining - reserved);

    if (allocation.amount - available > 0.000001) {
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

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.repaymentAllocation.createMany({
      data: allocations.map((allocation) => ({
        repaymentId: id,
        itemId: allocation.itemId,
        amount: allocation.amount,
        type: allocation.type,
      })),
    });

    return tx.repayment.update({
      where: { id },
      data: {
        principalPart,
        interestPart,
        feePart,
        penaltyPart,
        status: "PENDING_CONFIRM",
        matchComment: input.comment ?? "系统分配完成，等待客户确认付款",
      },
    });
  });

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

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    principalPart: Number(updated.principalPart),
    interestPart: Number(updated.interestPart),
    feePart: Number(updated.feePart),
    penaltyPart: Number(updated.penaltyPart),
  });
}
