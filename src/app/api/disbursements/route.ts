import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { getIdempotencyKey, checkIdempotencyKey, saveIdempotencyResult } from "@/lib/idempotency";
import { parsePagination, toPrismaArgs, paginatedResponse } from "@/lib/pagination";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  applicationId: z.string().min(1),
  fundAccountId: z.string().min(1).optional(),
  amount: z.number().positive(),
  feeAmount: z.number().min(0).default(0),
  remark: z.string().optional(),
});

function genDisbursementNo() {
  return `DB${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function GET(req: Request) {
  const session = await requirePermission(["disbursement:view"]);
  if (session instanceof Response) return session;

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
  const session = await requirePermission(["disbursement:create"]);
  if (session instanceof Response) return session;

  // 幂等性检查
  const idemKey = getIdempotencyKey(req);
  const cached = await checkIdempotencyKey(idemKey);
  if (cached) return NextResponse.json(cached);

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;
  const amountDec = new Decimal(input.amount);
  const feeDec = new Decimal(input.feeAmount);
  const netDec = amountDec.minus(feeDec).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  if (netDec.lte(0)) {
    return NextResponse.json({ error: "实到金额必须大于 0" }, { status: 400 });
  }

  try {
    const created = await prisma.$transaction(
      async (tx) => {
        // 1) 申请、合同状态校验（事务内重读以避免并发已变更）
        const app = await tx.loanApplication.findUnique({
          where: { id: input.applicationId },
        });
        if (!app || app.deletedAt) {
          throw new HttpError(404, "借款申请不存在");
        }
        if (app.status !== "CONTRACTED") {
          throw new HttpError(400, "仅已签署主合同的申请可创建放款单");
        }

        const signedMainContract = await tx.contract.findFirst({
          where: {
            applicationId: input.applicationId,
            contractType: "MAIN",
            status: "SIGNED",
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!signedMainContract) {
          throw new HttpError(400, "该申请未完成主合同签署，不能创建放款单");
        }

        const existing = await tx.disbursement.findFirst({
          where: { applicationId: input.applicationId },
          select: { id: true },
        });
        if (existing) {
          throw new HttpError(400, "该申请已创建放款单", { disbursementId: existing.id });
        }

        // 2) 放款金额不得超过审批额度
        if (app.totalApprovedAmount != null) {
          const approvedDec = new Decimal(app.totalApprovedAmount.toString());
          if (amountDec.gt(approvedDec)) {
            throw new HttpError(400, "放款金额超过审批额度");
          }
        }

        // 3) 选定资金账户（事务内）：未指定则按资金方优先级取首个；
        //    避免使用 balance>=amount 过滤，因为还要扣除其他 PENDING 的占用
        let fundAccountId = input.fundAccountId;
        if (!fundAccountId) {
          const candidate = await tx.fundAccount.findFirst({
            where: {
              isActive: true,
              funder: { isActive: true, deletedAt: null },
            },
            orderBy: { funder: { priority: "desc" } },
            select: { id: true },
          });
          if (!candidate) {
            throw new HttpError(400, "无可用资金账户（无活跃资金方）");
          }
          fundAccountId = candidate.id;
        }

        const fundAccount = await tx.fundAccount.findUnique({
          where: { id: fundAccountId },
        });
        if (!fundAccount || !fundAccount.isActive) {
          throw new HttpError(404, "资金账户不存在或不可用");
        }

        // 4) 余额校验：可用余额 = 当前余额 - 已占用（PENDING 放款单 netAmount 之和）
        const pendingAgg = await tx.disbursement.aggregate({
          where: { fundAccountId, status: "PENDING" },
          _sum: { netAmount: true },
        });
        const balanceDec = new Decimal(fundAccount.balance.toString());
        const reservedDec = new Decimal(pendingAgg._sum.netAmount?.toString() ?? "0");
        const availableDec = balanceDec.minus(reservedDec);
        if (availableDec.lt(netDec)) {
          throw new HttpError(400, "资金账户可用余额不足", {
            balance: balanceDec.toString(),
            reserved: reservedDec.toString(),
            requested: netDec.toString(),
          });
        }

        // 5) 创建放款单（PENDING；实际扣账在 confirm-paid 中）
        return tx.disbursement.create({
          data: {
            disbursementNo: genDisbursementNo(),
            applicationId: input.applicationId,
            fundAccountId: fundAccountId,
            amount: new Prisma.Decimal(amountDec.toString()),
            feeAmount: new Prisma.Decimal(feeDec.toString()),
            netAmount: new Prisma.Decimal(netDec.toString()),
            operatorId: session.sub,
            status: "PENDING",
            remark: input.remark ?? null,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

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

    const result = {
      id: created.id,
      disbursementNo: created.disbursementNo,
      status: created.status,
    };
    await saveIdempotencyResult(idemKey, result);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message, ...err.payload }, { status: err.status });
    }
    console.error("[disbursement-create]", err);
    return NextResponse.json({ error: "创建放款单失败" }, { status: 500 });
  }
}

class HttpError extends Error {
  constructor(public status: number, message: string, public payload: Record<string, unknown> = {}) {
    super(message);
  }
}
