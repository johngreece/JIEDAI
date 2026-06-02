import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { checkIdempotencyKey, getScopedIdempotencyKey, saveIdempotencyResult } from "@/lib/idempotency";
import { parsePagination, toPrismaArgs, paginatedResponse } from "@/lib/pagination";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import {
  amountsMatchWithinTolerance,
  calculateLiveOutstandingFromSnapshot,
  extractPaidDates,
} from "@/lib/repayment-runtime";
import {
  calculateRepaymentRegistrationOutstanding,
  isOpenRepaymentScheduleStatus,
  isRepaymentAmountWithinRegistrationOutstanding,
  REPAYMENT_REGISTRATION_BLOCKING_STATUSES,
} from "@/lib/repayment-registration";

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

  const idemKey = getScopedIdempotencyKey(req, ["admin", session.sub, "repayment-register"]);
  const cached = await checkIdempotencyKey(idemKey);
  if (cached) return NextResponse.json(cached);

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
      const plan = await tx.repaymentPlan.findUnique({
        where: { id: input.planId },
        select: {
          id: true,
          status: true,
          version: true,
          applicationId: true,
          rulesSnapshotJson: true,
          scheduleItems: {
            select: {
              id: true,
              status: true,
              remaining: true,
            },
            orderBy: { periodNumber: "asc" },
          },
        },
      });
      if (!plan) throw new Error("PLAN_NOT_FOUND");
      if (plan.status !== "ACTIVE") throw new Error("PLAN_NOT_ACTIVE");

      const claimedPlan = await tx.repaymentPlan.updateMany({
        where: { id: input.planId, version: plan.version },
        data: { version: { increment: 1 } },
      });
      if (claimedPlan.count !== 1) throw new Error("PLAN_CHANGED");

      // 检查是否已有未核销还款记录（防止重复创建）
      const pendingRepayment = await tx.repayment.findFirst({
        where: {
          planId: input.planId,
          status: {
            in: [...REPAYMENT_REGISTRATION_BLOCKING_STATUSES],
          },
        },
      });
      if (pendingRepayment) throw new Error("HAS_PENDING");

      const confirmedRepayments = await tx.repayment.findMany({
        where: {
          planId: input.planId,
          status: "CONFIRMED",
        },
        select: { amount: true },
      });
      const confirmedAmount = confirmedRepayments.reduce((sum, item) => sum + Number(item.amount), 0);
      const singleOpenItem =
        plan.scheduleItems.length === 1 && isOpenRepaymentScheduleStatus(plan.scheduleItems[0].status)
          ? plan.scheduleItems[0]
          : null;
      let outstandingLimit = calculateRepaymentRegistrationOutstanding(plan.scheduleItems);

      if (singleOpenItem) {
        const [application, overdueRecord] = await Promise.all([
          tx.loanApplication.findUnique({
            where: { id: plan.applicationId },
            select: {
              amount: true,
              disbursement: {
                select: { disbursedAt: true },
              },
            },
          }),
          tx.overdueRecord.findFirst({
            where: {
              scheduleItemId: singleOpenItem.id,
              status: "OVERDUE",
            },
            orderBy: { createdAt: "desc" },
            select: { overdueFeeDetail: true },
          }),
        ]);

        const liveOutstanding = application
          ? calculateLiveOutstandingFromSnapshot({
              rulesSnapshotJson: plan.rulesSnapshotJson,
              principal: Number(application.amount),
              disbursedAt: application.disbursement?.disbursedAt,
              paymentTime: new Date(),
              paidDates: extractPaidDates(overdueRecord?.overdueFeeDetail),
            })
          : null;

        if (liveOutstanding != null) {
          outstandingLimit = Math.max(0, liveOutstanding - confirmedAmount);
        }
      }

      if (!isRepaymentAmountWithinRegistrationOutstanding(input.amount, outstandingLimit)) {
        if (amountsMatchWithinTolerance(outstandingLimit, 0)) throw new Error("NO_OUTSTANDING");
        throw new Error(`AMOUNT_OVER_OUTSTANDING:${outstandingLimit.toFixed(2)}`);
      }

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
    if (msg === "PLAN_CHANGED") return NextResponse.json({ error: "还款计划状态已变化，请刷新后重试" }, { status: 409 });
    if (msg === "HAS_PENDING") return NextResponse.json({ error: "该计划已有待处理的还款，请先处理" }, { status: 409 });
    if (msg === "NO_OUTSTANDING") return NextResponse.json({ error: "该计划当前没有可登记的未还余额" }, { status: 400 });
    if (msg.startsWith("AMOUNT_OVER_OUTSTANDING:")) {
      const available = Number(msg.split(":")[1] ?? 0);
      return NextResponse.json(
        { error: `登记金额不能超过当前可还余额，当前最多可登记 ${available.toFixed(2)}` },
        { status: 400 }
      );
    }
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

  const result = {
    id: created.id,
    repaymentNo: created.repaymentNo,
    status: created.status,
  };
  await saveIdempotencyResult(idemKey, result);

  return NextResponse.json(result);
}
