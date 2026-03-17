import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

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
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;

  const list = await prisma.repayment.findMany({
    where: {
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      plan: { select: { id: true, planNo: true, applicationId: true } },
      operator: { select: { id: true, username: true, realName: true } },
    },
    take: 200,
  });
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

  return NextResponse.json({
    items: typedList.map((x: RepaymentListItem) => ({
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
  });
}

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;
  const plan = await prisma.repaymentPlan.findUnique({ where: { id: input.planId } });
  if (!plan) return NextResponse.json({ error: "还款计划不存在" }, { status: 404 });
  if (plan.status !== "ACTIVE") return NextResponse.json({ error: "仅 ACTIVE 计划可登记还款" }, { status: 400 });

  const created = await prisma.repayment.create({
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
  }).catch(() => undefined);

  return NextResponse.json({
    id: created.id,
    repaymentNo: created.repaymentNo,
    status: created.status,
  });
}
