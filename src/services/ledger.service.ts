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

function decimalToNumber(value: Decimal.Value | null | undefined) {
  return Number(value || 0);
}

function csvCell(value: string | number | null | undefined) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function formatLedgerDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function normalizeDateBoundary(value: Date | string | null | undefined, boundary: "start" | "end") {
  if (!value) return null;

  const rawValue = value instanceof Date ? value : String(value).trim();
  if (!rawValue) return null;

  const isDateOnly = typeof rawValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawValue);
  const date = value instanceof Date
    ? new Date(value.getTime())
    : new Date(isDateOnly ? `${rawValue}T00:00:00` : rawValue);

  if (Number.isNaN(date.getTime())) return null;

  if (isDateOnly) {
    if (boundary === "start") {
      date.setHours(0, 0, 0, 0);
    } else {
      date.setHours(23, 59, 59, 999);
    }
  }

  return date;
}

function formatDateOnly(value: Date | null) {
  if (!value) return "";
  return value.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function buildLedgerDateRange(params: {
  startDate?: Date | string | null;
  endDate?: Date | string | null;
}) {
  const startAt = normalizeDateBoundary(params.startDate, "start");
  const endAt = normalizeDateBoundary(params.endDate, "end");
  const createdAt: Prisma.DateTimeFilter = {};

  if (startAt) createdAt.gte = startAt;
  if (endAt) createdAt.lte = endAt;

  const periodLabel = startAt && endAt
    ? `${formatDateOnly(startAt)} 至 ${formatDateOnly(endAt)}`
    : startAt
      ? `${formatDateOnly(startAt)} 起`
      : endAt
        ? `截至 ${formatDateOnly(endAt)}`
        : "全部时间";

  return {
    createdAt: Object.keys(createdAt).length ? createdAt : undefined,
    startAt,
    endAt,
    periodLabel,
  };
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
  if (params.customerId) {
    const [lockedCustomer] = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM customers WHERE id = ${params.customerId} FOR UPDATE
    `;
    if (!lockedCustomer) {
      throw new Error("Customer not found");
    }
  }

  const lastEntry = params.customerId
    ? await tx.ledgerEntry.findFirst({
        where: { customerId: params.customerId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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

export function ledgerListToCSV(statement: Awaited<ReturnType<typeof getLedgerList>>) {
  const BOM = "\uFEFF";
  const summary = statement.summary;
  const header = [
    "统一资金台账",
    `导出时间: ${formatLedgerDate(new Date())}`,
    `筛选时间: ${statement.filters.periodLabel}`,
    `导出行数: ${statement.items.length} / 当前筛选 ${statement.total} 笔`,
    `当前筛选金额: €${summary.totalAmount.toFixed(2)}`,
    `入账合计: €${summary.inflowAmount.toFixed(2)}`,
    `出账合计: €${summary.outflowAmount.toFixed(2)}`,
    `客户台账: €${summary.customerAmount.toFixed(2)} / ${summary.customerCount} 笔`,
    `资金方账户: €${summary.funderAmount.toFixed(2)} / ${summary.funderCount} 笔`,
    "",
    "时间,来源,流水号,类型,方向,金额(€),余额前(€),余额后(€),余额口径,对象类型,对象,资金账户,说明,引用类型,引用ID,操作员",
  ].join("\n");

  const rows = statement.items.map((entry) =>
    [
      csvCell(formatLedgerDate(entry.createdAt)),
      csvCell(entry.sourceLabel),
      csvCell(entry.entryNo),
      csvCell(entry.typeLabel),
      csvCell(entry.directionLabel),
      entry.amount.toFixed(2),
      entry.balanceBefore.toFixed(2),
      entry.balanceAfter.toFixed(2),
      csvCell(entry.balanceScope),
      csvCell(entry.counterpartyType),
      csvCell(entry.counterpartyName),
      csvCell(entry.fundAccount?.accountName ?? ""),
      csvCell(entry.description ?? ""),
      csvCell(entry.referenceType),
      csvCell(entry.referenceId),
      csvCell(entry.operator?.realName || entry.operator?.username || ""),
    ].join(","),
  );

  return `${BOM}${header}\n${rows.join("\n")}`;
}

/**
 * 查询全局台账
 */
export async function getLedgerList(params: {
  type?: string;
  direction?: string;
  movement?: string;
  scope?: string;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  page?: number;
  pageSize?: number;
}) {
  const { type, direction, movement, scope, startDate, endDate, page = 1, pageSize = 20 } = params;
  const normalizedScope = scope === "customer" || scope === "funder" ? scope : "all";
  const normalizedMovement = movement === "INFLOW" || movement === "OUTFLOW" ? movement : null;
  const dateRange = buildLedgerDateRange({ startDate, endDate });
  const customerDirection = normalizedMovement
    ? normalizedMovement === "INFLOW" ? "DEBIT" : "CREDIT"
    : direction;
  const funderDirection = normalizedMovement
    ? normalizedMovement === "INFLOW" ? "CREDIT" : "DEBIT"
    : direction;
  const offset = (page - 1) * pageSize;
  const fetchSize = offset + pageSize;

  const customerWhere: Prisma.LedgerEntryWhereInput = {
    ...(type ? { type } : {}),
    ...(customerDirection ? { direction: customerDirection } : {}),
    ...(dateRange.createdAt ? { createdAt: dateRange.createdAt } : {}),
  };
  const funderWhere: Prisma.FundAccountJournalWhereInput = {
    ...(type ? { type } : {}),
    ...(funderDirection ? { direction: funderDirection } : {}),
    ...(dateRange.createdAt ? { createdAt: dateRange.createdAt } : {}),
  };

  const includeCustomerLedger = normalizedScope === "all" || normalizedScope === "customer";
  const includeFunderLedger = normalizedScope === "all" || normalizedScope === "funder";
  const customerInflowWhere = !customerDirection || customerDirection === "DEBIT"
    ? { ...customerWhere, direction: "DEBIT" }
    : null;
  const customerOutflowWhere = !customerDirection || customerDirection === "CREDIT"
    ? { ...customerWhere, direction: "CREDIT" }
    : null;
  const funderInflowWhere = !funderDirection || funderDirection === "CREDIT"
    ? { ...funderWhere, direction: "CREDIT" }
    : null;
  const funderOutflowWhere = !funderDirection || funderDirection === "DEBIT"
    ? { ...funderWhere, direction: "DEBIT" }
    : null;

  const [
    customerItems,
    customerTotal,
    customerAmountResult,
    customerInflowResult,
    customerOutflowResult,
    funderItems,
    funderTotal,
    funderAmountResult,
    funderInflowResult,
    funderOutflowResult,
  ] = await Promise.all([
    includeCustomerLedger
      ? prisma.ledgerEntry.findMany({
          where: customerWhere,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: fetchSize,
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            operator: { select: { id: true, username: true, realName: true } },
          },
        })
      : Promise.resolve([]),
    includeCustomerLedger ? prisma.ledgerEntry.count({ where: customerWhere }) : Promise.resolve(0),
    includeCustomerLedger
      ? prisma.ledgerEntry.aggregate({ where: customerWhere, _sum: { amount: true } })
      : Promise.resolve({ _sum: { amount: null } }),
    includeCustomerLedger && customerInflowWhere
      ? prisma.ledgerEntry.aggregate({ where: customerInflowWhere, _sum: { amount: true } })
      : Promise.resolve({ _sum: { amount: null } }),
    includeCustomerLedger && customerOutflowWhere
      ? prisma.ledgerEntry.aggregate({ where: customerOutflowWhere, _sum: { amount: true } })
      : Promise.resolve({ _sum: { amount: null } }),
    includeFunderLedger
      ? prisma.fundAccountJournal.findMany({
          where: funderWhere,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: fetchSize,
          include: {
            fundAccount: {
              select: {
                id: true,
                accountName: true,
                bankName: true,
                accountNo: true,
                funder: { select: { id: true, name: true } },
              },
            },
            operator: { select: { id: true, username: true, realName: true } },
          },
        })
      : Promise.resolve([]),
    includeFunderLedger ? prisma.fundAccountJournal.count({ where: funderWhere }) : Promise.resolve(0),
    includeFunderLedger
      ? prisma.fundAccountJournal.aggregate({ where: funderWhere, _sum: { amount: true } })
      : Promise.resolve({ _sum: { amount: null } }),
    includeFunderLedger && funderInflowWhere
      ? prisma.fundAccountJournal.aggregate({ where: funderInflowWhere, _sum: { amount: true } })
      : Promise.resolve({ _sum: { amount: null } }),
    includeFunderLedger && funderOutflowWhere
      ? prisma.fundAccountJournal.aggregate({ where: funderOutflowWhere, _sum: { amount: true } })
      : Promise.resolve({ _sum: { amount: null } }),
  ]);

  const customerTypeLabel: Record<string, string> = {
    DISBURSEMENT: "客户放款",
    REPAYMENT: "客户还款",
    FEE: "费用收入",
    PENALTY: "罚息收入",
    EXTENSION_FEE: "展期费收入",
    FUND_INFLOW: "资金方入金",
    ADJUSTMENT: "客户调账",
  };
  const funderTypeLabel: Record<string, string> = {
    CAPITAL_INFLOW: "资金方入金",
    DISBURSEMENT: "资金账户放款",
    REPAYMENT: "资金账户回款",
    INTEREST_SETTLEMENT: "资金方收益入账",
    WITHDRAWAL: "资金方提现",
    ADJUSTMENT: "资金账户调账",
  };

  const normalizedItems = [
    ...customerItems.map((entry) => ({
      id: `customer:${entry.id}`,
      ledgerId: entry.id,
      source: "CUSTOMER_LEDGER",
      sourceLabel: "客户台账",
      entryNo: entry.entryNo,
      type: entry.type,
      typeLabel: customerTypeLabel[entry.type] ?? entry.type,
      direction: entry.direction,
      movement: entry.direction === "DEBIT" ? "INFLOW" : "OUTFLOW",
      directionLabel: entry.direction === "DEBIT" ? "入账" : "出账",
      amount: Number(entry.amount),
      balanceBefore: Number(entry.balanceBefore),
      balanceAfter: Number(entry.balanceAfter),
      balanceScope: "客户应收余额",
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      description: entry.description,
      createdAt: entry.createdAt,
      customer: entry.customer,
      funder: null,
      fundAccount: null,
      counterpartyType: "客户",
      counterpartyName: entry.customer?.name ?? "-",
      operator: entry.operator,
    })),
    ...funderItems.map((entry) => ({
      id: `funder:${entry.id}`,
      ledgerId: entry.id,
      source: "FUNDER_ACCOUNT",
      sourceLabel: "资金方账户",
      entryNo: entry.entryNo,
      type: entry.type,
      typeLabel: funderTypeLabel[entry.type] ?? entry.type,
      direction: entry.direction,
      movement: entry.direction === "CREDIT" ? "INFLOW" : "OUTFLOW",
      directionLabel: entry.direction === "CREDIT" ? "账户入账" : "账户出账",
      amount: Number(entry.amount),
      balanceBefore: Number(entry.balanceBefore),
      balanceAfter: Number(entry.balanceAfter),
      balanceScope: "资金方账户余额",
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      description: entry.description,
      createdAt: entry.createdAt,
      customer: null,
      funder: entry.fundAccount.funder,
      fundAccount: {
        id: entry.fundAccount.id,
        accountName: entry.fundAccount.accountName,
        bankName: entry.fundAccount.bankName,
        accountNo: entry.fundAccount.accountNo,
      },
      counterpartyType: "资金方",
      counterpartyName: entry.fundAccount.funder.name,
      operator: entry.operator,
    })),
  ].sort((a, b) => {
    const diff = b.createdAt.getTime() - a.createdAt.getTime();
    return diff !== 0 ? diff : b.id.localeCompare(a.id);
  });

  const items = normalizedItems.slice(offset, offset + pageSize);
  const total = customerTotal + funderTotal;
  const customerAmount = decimalToNumber(customerAmountResult._sum.amount);
  const funderAmount = decimalToNumber(funderAmountResult._sum.amount);
  const customerInflowAmount = decimalToNumber(customerInflowResult._sum.amount);
  const customerOutflowAmount = decimalToNumber(customerOutflowResult._sum.amount);
  const funderInflowAmount = decimalToNumber(funderInflowResult._sum.amount);
  const funderOutflowAmount = decimalToNumber(funderOutflowResult._sum.amount);

  return {
    items,
    summary: {
      totalAmount: customerAmount + funderAmount,
      inflowAmount: customerInflowAmount + funderInflowAmount,
      outflowAmount: customerOutflowAmount + funderOutflowAmount,
      customerAmount,
      funderAmount,
      customerCount: customerTotal,
      funderCount: funderTotal,
    },
    filters: {
      type: type ?? null,
      movement: normalizedMovement,
      scope: normalizedScope,
      startDate: dateRange.startAt?.toISOString() ?? null,
      endDate: dateRange.endAt?.toISOString() ?? null,
      periodLabel: dateRange.periodLabel,
    },
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
