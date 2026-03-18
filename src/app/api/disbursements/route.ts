import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { getIdempotencyKey, checkIdempotencyKey, saveIdempotencyResult } from "@/lib/idempotency";
import { parsePagination, toPrismaArgs, paginatedResponse } from "@/lib/pagination";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  applicationId: z.string().min(1),
  fundAccountId: z.string().min(1),
  amount: z.number().positive(),
  feeAmount: z.number().min(0).default(0),
  remark: z.string().optional(),
});

function genDisbursementNo() {
  return `DB${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const pagination = parsePagination(url);

  const where = {
    ...(status ? { status } : {}),
  };

  const [list, total] = await Promise.all([
    prisma.disbursement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        application: {
          select: {
            id: true,
            applicationNo: true,
            customer: { select: { id: true, name: true, phone: true } },
          },
        },
        fundAccount: { select: { id: true, accountName: true, accountNo: true } },
      },
      ...toPrismaArgs(pagination),
    }),
    prisma.disbursement.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(
    list.map((x: {
      id: string;
      disbursementNo: string;
      status: string;
      amount: unknown;
      feeAmount: unknown;
      netAmount: unknown;
      createdAt: Date;
      application: {
        id: string;
        applicationNo: string;
        customer: { id: string; name: string; phone: string };
      };
      fundAccount: { id: string; accountName: string; accountNo: string };
    }) => ({
      id: x.id,
      disbursementNo: x.disbursementNo,
      status: x.status,
      amount: Number(x.amount),
      feeAmount: Number(x.feeAmount),
      netAmount: Number(x.netAmount),
      createdAt: x.createdAt,
      application: x.application,
      fundAccount: x.fundAccount,
    })),
    total,
    pagination,
  ));
}

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });
  }

  // 幂等性检查
  const idemKey = getIdempotencyKey(req);
  const cached = checkIdempotencyKey(idemKey);
  if (cached) return NextResponse.json(cached);

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;
  const netAmount = Number((input.amount - input.feeAmount).toFixed(2));
  if (netAmount <= 0) {
    return NextResponse.json({ error: "实到金额必须大于 0" }, { status: 400 });
  }

  const [app, fundAccount, existing] = await Promise.all([
    prisma.loanApplication.findUnique({ where: { id: input.applicationId } }),
    prisma.fundAccount.findUnique({ where: { id: input.fundAccountId } }),
    prisma.disbursement.findFirst({ where: { applicationId: input.applicationId } }),
  ]);

  if (!app || app.deletedAt) {
    return NextResponse.json({ error: "借款申请不存在" }, { status: 404 });
  }
  if (!fundAccount || !fundAccount.isActive) {
    return NextResponse.json({ error: "资金账户不存在或不可用" }, { status: 404 });
  }
  if (existing) {
    return NextResponse.json({ error: "该申请已创建放款单", disbursementId: existing.id }, { status: 400 });
  }
  if (app.status !== "APPROVED") {
    return NextResponse.json({ error: "仅审批通过的申请可创建放款单" }, { status: 400 });
  }

  const created = await prisma.disbursement.create({
    data: {
      disbursementNo: genDisbursementNo(),
      applicationId: input.applicationId,
      fundAccountId: input.fundAccountId,
      amount: input.amount,
      feeAmount: input.feeAmount,
      netAmount,
      operatorId: session.sub,
      status: "PENDING",
      remark: input.remark ?? null,
    },
  });

  await writeAuditLog({
    userId: session.sub,
    action: "create",
    entityType: "disbursement",
    entityId: created.id,
    newValue: {
      disbursementNo: created.disbursementNo,
      status: created.status,
      amount: Number(created.amount),
      netAmount: Number(created.netAmount),
    },
    changeSummary: "创建放款单",
  }).catch((e) => console.error("[AuditLog] disbursement-create", e));

  const result = { id: created.id, disbursementNo: created.disbursementNo, status: created.status };
  saveIdempotencyResult(idemKey, result);
  return NextResponse.json(result);
}
