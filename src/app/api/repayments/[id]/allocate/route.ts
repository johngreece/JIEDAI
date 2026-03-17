import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { Prisma } from "@prisma/client";

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
  status: string;
  paidAt: Date | null;
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
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = allocateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const input = parsed.data;

  const repayment = await prisma.repayment.findUnique({
    where: { id },
    include: { allocations: true },
  });
  if (!repayment) return NextResponse.json({ error: "还款记录不存在" }, { status: 404 });
  if (repayment.allocations.length > 0) {
    return NextResponse.json({ error: "该还款已分配，不能重复分配" }, { status: 400 });
  }
  if (!["PENDING", "MATCHED"].includes(repayment.status)) {
    return NextResponse.json({ error: "当前状态不允许分配" }, { status: 400 });
  }

  const allocations = input.allocations as AllocationInput[];
  const itemIds = allocations.map((x: AllocationInput) => x.itemId);
  const scheduleItems = await prisma.repaymentScheduleItem.findMany({
    where: { id: { in: itemIds }, planId: repayment.planId },
  });
  const typedScheduleItems = scheduleItems as ScheduleItemLite[];
  if (scheduleItems.length !== itemIds.length) {
    return NextResponse.json({ error: "存在无效期次或不属于当前计划" }, { status: 400 });
  }

  const sum = allocations.reduce((acc: number, x: AllocationInput) => acc + x.amount, 0);
  if (sum - Number(repayment.amount) > 0.000001) {
    return NextResponse.json({ error: "分配总额不能大于还款金额" }, { status: 400 });
  }

  const itemMap = new Map<string, ScheduleItemLite>(typedScheduleItems.map((x: ScheduleItemLite) => [x.id, x]));
  for (const a of allocations) {
    const item = itemMap.get(a.itemId);
    if (!item) continue;
    const remaining = Number(item.remaining);
    if (a.amount - remaining > 0.000001) {
      return NextResponse.json({ error: `期次 ${item.periodNumber} 分配金额超出剩余应还` }, { status: 400 });
    }
  }

  const principalPart = allocations.filter((x: AllocationInput) => x.type === "PRINCIPAL").reduce((acc: number, x: AllocationInput) => acc + x.amount, 0);
  const interestPart = allocations.filter((x: AllocationInput) => x.type === "INTEREST").reduce((acc: number, x: AllocationInput) => acc + x.amount, 0);
  const feePart = allocations.filter((x: AllocationInput) => x.type === "FEE").reduce((acc: number, x: AllocationInput) => acc + x.amount, 0);
  const penaltyPart = allocations.filter((x: AllocationInput) => x.type === "PENALTY").reduce((acc: number, x: AllocationInput) => acc + x.amount, 0);

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.repaymentAllocation.createMany({
      data: input.allocations.map((a) => ({
        repaymentId: id,
        itemId: a.itemId,
        amount: a.amount,
        type: a.type,
      })),
    });

    for (const a of allocations) {
      const current = itemMap.get(a.itemId);
      if (!current) continue;
      const nextRemaining = Number(current.remaining) - a.amount;
      await tx.repaymentScheduleItem.update({
        where: { id: a.itemId },
        data: {
          remaining: Math.max(0, nextRemaining),
          status: nextRemaining <= 0.000001 ? "PAID" : current.status,
          paidAt: nextRemaining <= 0.000001 ? new Date() : current.paidAt,
        },
      });
    }

    return tx.repayment.update({
      where: { id },
      data: {
        principalPart,
        interestPart,
        feePart,
        penaltyPart,
        status: "PENDING_CONFIRM",
        matchComment: input.comment ?? "系统分配完成，待客户确认",
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
      allocatedTotal: sum,
    },
    changeSummary: "还款分配完成，进入待客户确认",
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
