import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { parsePagination, toPrismaArgs, paginatedResponse } from "@/lib/pagination";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

type RepaymentListItem = {
  id: string;
  repaymentNo: string;
  status: string;
  amount: unknown;
  paymentMethod: string;
  receivedAt: Date | null;
  principalPart: unknown;
  interestPart: unknown;
  feePart: unknown;
  penaltyPart: unknown;
  createdAt: Date;
  plan: { id: string; planNo: string; applicationId: string };
  operator: { id: string; username: string; realName: string | null } | null;
};

type AppLite = {
  id: string;
  applicationNo: string;
  customer: { id: string; name: string; phone: string };
  product: { id: string; name: string };
};

const createSchema = z.object({
  planId: z.string().min(1),
  amount: z.number().positive(),
  paymentMethod: z.string().min(1),
  remark: z.string().optional(),
});

function genRepaymentNo() {
  return `RPY${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function GET(req: Request) {
  const session = await requirePermission(["repayment:view"]);
  if (session instanceof Response) return session;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const pagination = parsePagination(url);

  const where = {
    ...(status ? { status } : {}),
  };

  const [list, total] = await Promise.all([
    prisma.repayment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        plan: { select: { id: true, planNo: true, applicationId: true } },
        operator: { select: { id: true, username: true, realName: true } },
      },
      ...toPrismaArgs(pagination),
    }),
    prisma.repayment.count({ where }),
  ]);
  const typedList = list as RepaymentListItem[];

  const appIds = typedList.map((x: RepaymentListItem) => x.plan.applicationId);
  const apps = appIds.length
    ? await prisma.loanApplication.findMany({
        where: { id: { in: appIds } },
        select: {
          id: true,
          applicationNo: true,
          customer: { select: { id: true, name: true, phone: true } },
          product: { select: { id: true, name: true } },
        },
      })
    : [];
  const typedApps = apps as AppLite[];
  const appMap = new Map<string, AppLite>(typedApps.map((x: AppLite) => [x.id, x]));

  return NextResponse.json(paginatedResponse(
    typedList.map((x: RepaymentListItem) => ({
      id: x.id,
      repaymentNo: x.repaymentNo,
      status: x.status,
      amount: Number(x.amount),
      paymentMethod: x.paymentMethod,
      receivedAt: x.receivedAt,
      principalPart: Number(x.principalPart),
      interestPart: Number(x.interestPart),
      feePart: Number(x.feePart),
      penaltyPart: Number(x.penaltyPart),
      plan: x.plan,
      application: appMap.get(x.plan.applicationId) ?? null,
      operator: x.operator,
      createdAt: x.createdAt,
    })),
    total,
    pagination,
  ));
}

export async function POST(req: Request) {
  const session = await requirePermission(["repayment:create"]);
  if (session instanceof Response) return session;

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;

  // 使用事务 + 乐观锁防止并发重复还款
  let created;
  try {
    created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const plan = await tx.repaymentPlan.findUnique({ where: { id: input.planId } });
      if (!plan) throw new Error("PLAN_NOT_FOUND");
      if (plan.status !== "ACTIVE") throw new Error("PLAN_NOT_ACTIVE");

      // 检查是否有 PENDING 状态的还款记录（防止重复创建）
      const pendingRepayment = await tx.repayment.findFirst({
        where: { planId: input.planId, status: "PENDING" },
      });
      if (pendingRepayment) throw new Error("HAS_PENDING");

      return tx.repayment.create({
        data: {
          repaymentNo: genRepaymentNo(),
          planId: input.planId,
          amount: input.amount,
          principalPart: 0,
          interestPart: 0,
          feePart: 0,
          penaltyPart: 0,
          paymentMethod: input.paymentMethod,
          status: "PENDING",
          receivedAt: new Date(),
          operatorId: session.sub,
          remark: input.remark ?? null,
        },
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "PLAN_NOT_FOUND") return NextResponse.json({ error: "还款计划不存在" }, { status: 404 });
    if (msg === "PLAN_NOT_ACTIVE") return NextResponse.json({ error: "仅 ACTIVE 计划可登记还款" }, { status: 400 });
    if (msg === "HAS_PENDING") return NextResponse.json({ error: "该计划已有待处理的还款，请先处理" }, { status: 409 });
    return NextResponse.json({ error: "还款登记失败" }, { status: 500 });
  }

  await writeAuditLog({
    userId: session.sub,
    action: "repay_register",
    entityType: "repayment",
    entityId: created.id,
    newValue: {
      repaymentNo: created.repaymentNo,
      amount: Number(created.amount),
      planId: created.planId,
      status: created.status,
    },
    changeSummary: "财务登记还款",
  }).catch((e) => console.error("[AuditLog] repayment-create", e));

  return NextResponse.json({
    id: created.id,
    repaymentNo: created.repaymentNo,
    status: created.status,
  });
}
