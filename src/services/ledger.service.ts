/**
 * 台账（总账）服务
 * 每笔资金进出都必须写入 ledger_entries，实现资金可追溯
 *
 * 记账类型:
 *   DISBURSEMENT    — 放款（CREDIT 出账）
 *   REPAYMENT       — 还款（DEBIT 入账）
 *   FEE             — 费用收取（DEBIT 入账）
 *   PENALTY         — 罚息收取（DEBIT 入账）
 *   EXTENSION_FEE   — 展期费用（DEBIT 入账）
 *   FUND_INFLOW     — 资金方入金（CREDIT 资金池增加）
 *   ADJUSTMENT      — 手工调账
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";

export type LedgerType =
  | "DISBURSEMENT"
  | "REPAYMENT"
  | "FEE"
  | "PENALTY"
  | "EXTENSION_FEE"
  | "FUND_INFLOW"
  | "ADJUSTMENT";

export type LedgerDirection = "DEBIT" | "CREDIT";

function genEntryNo() {
  return `LE${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/**
 * 写入一条台账记录（在事务内调用）
 */
export async function writeLedgerEntry(
  tx: Prisma.TransactionClient,
  params: {
    type: LedgerType;
    direction: LedgerDirection;
    amount: number | Decimal;
    referenceType: string;
    referenceId: string;
    customerId?: string | null;
    operatorId?: string | null;
    description?: string;
  }
) {
  const amount = new Decimal(params.amount.toString());

  // 获取当前余额（按客户维度，如果有 customerId）
  const lastEntry = params.customerId
    ? await tx.ledgerEntry.findFirst({
        where: { customerId: params.customerId },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const balanceBefore = lastEntry
    ? new Decimal(lastEntry.balanceAfter.toString())
    : new Decimal(0);

  // DEBIT = 入账(还款等，余额减少 = 欠款减少)
  // CREDIT = 出账(放款等，余额增加 = 欠款增加)
  const balanceAfter =
    params.direction === "CREDIT"
      ? balanceBefore.plus(amount)
      : balanceBefore.minus(amount);

  return tx.ledgerEntry.create({
    data: {
      entryNo: genEntryNo(),
      type: params.type,
      direction: params.direction,
      amount: amount.toNumber(),
      balanceBefore: balanceBefore.toNumber(),
      balanceAfter: balanceAfter.toNumber(),
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      customerId: params.customerId ?? null,
      operatorId: params.operatorId ?? null,
      description: params.description ?? null,
    },
  });
}

/**
 * 放款记账（放款确认时调用）
 */
export async function recordDisbursementLedger(
  tx: Prisma.TransactionClient,
  params: {
    disbursementId: string;
    amount: number | Decimal;
    feeAmount: number | Decimal;
    customerId: string;
    operatorId: string;
  }
) {
  // 放款本金 — 客户欠款增加
  await writeLedgerEntry(tx, {
    type: "DISBURSEMENT",
    direction: "CREDIT",
    amount: params.amount,
    referenceType: "disbursement",
    referenceId: params.disbursementId,
    customerId: params.customerId,
    operatorId: params.operatorId,
    description: "放款",
  });

  // 放款手续费 — 费用收入
  const fee = new Decimal(params.feeAmount.toString());
  if (fee.gt(0)) {
    await writeLedgerEntry(tx, {
      type: "FEE",
      direction: "DEBIT",
      amount: fee,
      referenceType: "disbursement",
      referenceId: params.disbursementId,
      customerId: params.customerId,
      operatorId: params.operatorId,
      description: "放款手续费",
    });
  }
}

/**
 * 还款记账（还款确认时调用）
 */
export async function recordRepaymentLedger(
  tx: Prisma.TransactionClient,
  params: {
    repaymentId: string;
    principalPart: number | Decimal;
    interestPart: number | Decimal;
    feePart: number | Decimal;
    penaltyPart: number | Decimal;
    customerId: string;
    operatorId: string;
  }
) {
  const principal = new Decimal(params.principalPart.toString());
  const interest = new Decimal(params.interestPart.toString());
  const fee = new Decimal(params.feePart.toString());
  const penalty = new Decimal(params.penaltyPart.toString());
  const total = principal.plus(interest).plus(fee).plus(penalty);

  // 还款 — 客户欠款减少
  if (total.gt(0)) {
    await writeLedgerEntry(tx, {
      type: "REPAYMENT",
      direction: "DEBIT",
      amount: total,
      referenceType: "repayment",
      referenceId: params.repaymentId,
      customerId: params.customerId,
      operatorId: params.operatorId,
      description: `还款: 本金${principal} + 利息${interest} + 费用${fee} + 罚息${penalty}`,
    });
  }
}

/**
 * 查询客户台账
 */
export async function getCustomerLedger(params: {
  customerId: string;
  page?: number;
  pageSize?: number;
}) {
  const { customerId, page = 1, pageSize = 20 } = params;
  const where: Prisma.LedgerEntryWhereInput = { customerId };

  const [items, total] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ledgerEntry.count({ where }),
  ]);

  return {
    items: items.map((e) => ({
      ...e,
      amount: Number(e.amount),
      balanceBefore: Number(e.balanceBefore),
      balanceAfter: Number(e.balanceAfter),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * 查询全局台账
 */
export async function getLedgerList(params: {
  type?: string;
  direction?: string;
  page?: number;
  pageSize?: number;
}) {
  const { type, direction, page = 1, pageSize = 20 } = params;
  const where: Prisma.LedgerEntryWhereInput = {
    ...(type ? { type } : {}),
    ...(direction ? { direction } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        operator: { select: { id: true, username: true, realName: true } },
      },
    }),
    prisma.ledgerEntry.count({ where }),
  ]);

  return {
    items: items.map((e) => ({
      ...e,
      amount: Number(e.amount),
      balanceBefore: Number(e.balanceBefore),
      balanceAfter: Number(e.balanceAfter),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
