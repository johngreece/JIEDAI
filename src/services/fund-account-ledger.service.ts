import Decimal from "decimal.js";
import { Prisma } from "@prisma/client";

export type FundAccountLedgerType =
  | "CAPITAL_INFLOW"
  | "DISBURSEMENT"
  | "REPAYMENT"
  | "INTEREST_SETTLEMENT"
  | "WITHDRAWAL"
  | "ADJUSTMENT";

export type FundAccountLedgerDirection = "CREDIT" | "DEBIT";

type WriteFundAccountLedgerEntryParams = {
  fundAccountId: string;
  type: FundAccountLedgerType;
  direction: FundAccountLedgerDirection;
  amount: number | Decimal;
  referenceType: string;
  referenceId: string;
  operatorId?: string | null;
  description?: string;
  metadata?: Record<string, unknown> | null;
};

type FundAccountTotalDeltas = {
  totalInflowDelta?: number | Decimal;
  totalOutflowDelta?: number | Decimal;
  totalProfitDelta?: number | Decimal;
};

function genEntryNo() {
  return `FA${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function toPositiveAmount(value: number | Decimal) {
  const amount = new Decimal(value.toString());
  if (!amount.gt(0)) {
    throw new Error("Fund account journal amount must be greater than 0");
  }
  return amount;
}

async function lockFundAccountBalance(tx: Prisma.TransactionClient, fundAccountId: string) {
  const [lockedAccount] = await tx.$queryRaw<Array<{ balance: Decimal }>>`
    SELECT balance FROM fund_accounts WHERE id = ${fundAccountId} FOR UPDATE
  `;
  if (!lockedAccount) {
    throw new Error("Fund account not found");
  }
  return new Decimal(lockedAccount.balance.toString());
}

async function createFundAccountLedgerEntry(
  tx: Prisma.TransactionClient,
  params: WriteFundAccountLedgerEntryParams,
  balanceBefore: Decimal,
  amount: Decimal,
) {
  const balanceAfter =
    params.direction === "CREDIT"
      ? balanceBefore.plus(amount)
      : balanceBefore.minus(amount);

  if (balanceAfter.lt(0)) {
    throw new Error("Fund account balance would become negative");
  }

  const journal = await tx.fundAccountJournal.create({
    data: {
      entryNo: genEntryNo(),
      fundAccountId: params.fundAccountId,
      type: params.type,
      direction: params.direction,
      amount: amount.toNumber(),
      balanceBefore: balanceBefore.toNumber(),
      balanceAfter: balanceAfter.toNumber(),
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      operatorId: params.operatorId ?? null,
      description: params.description ?? null,
      metadataJson: params.metadata ? JSON.stringify(params.metadata) : null,
    },
  });

  return { journal, balanceAfter };
}

function applyDecimalDelta(
  data: Prisma.FundAccountUpdateInput,
  field: "totalInflow" | "totalOutflow" | "totalProfit",
  value: number | Decimal | undefined,
) {
  if (value === undefined) return;

  const delta = new Decimal(value.toString());
  if (delta.gt(0)) {
    data[field] = { increment: delta.toNumber() };
  } else if (delta.lt(0)) {
    data[field] = { decrement: delta.abs().toNumber() };
  }
}

function buildFundAccountUpdateData(balanceAfter: Decimal, deltas: FundAccountTotalDeltas = {}) {
  const data: Prisma.FundAccountUpdateInput = {
    balance: balanceAfter.toNumber(),
  };

  applyDecimalDelta(data, "totalInflow", deltas.totalInflowDelta);
  applyDecimalDelta(data, "totalOutflow", deltas.totalOutflowDelta);
  applyDecimalDelta(data, "totalProfit", deltas.totalProfitDelta);

  return data;
}

export async function writeFundAccountLedgerEntryAndUpdateAccount(
  tx: Prisma.TransactionClient,
  params: WriteFundAccountLedgerEntryParams & FundAccountTotalDeltas,
) {
  const amount = toPositiveAmount(params.amount);
  const balanceBefore = await lockFundAccountBalance(tx, params.fundAccountId);
  const result = await createFundAccountLedgerEntry(tx, params, balanceBefore, amount);
  const account = await tx.fundAccount.update({
    where: { id: params.fundAccountId },
    data: buildFundAccountUpdateData(result.balanceAfter, params),
    select: {
      id: true,
      balance: true,
      totalInflow: true,
      totalOutflow: true,
      totalProfit: true,
    },
  });

  return {
    journal: result.journal,
    account,
    fundAccountId: params.fundAccountId,
    balanceAfter: result.balanceAfter.toNumber(),
  };
}

export async function writeDebitFundAccountLedgerEntryFromCandidates(
  tx: Prisma.TransactionClient,
  params: Omit<WriteFundAccountLedgerEntryParams, "direction" | "fundAccountId"> & {
    candidateFundAccountIds: string[];
  },
) {
  const amount = toPositiveAmount(params.amount);
  const candidateIds = Array.from(new Set(params.candidateFundAccountIds));

  for (const fundAccountId of candidateIds) {
    const balanceBefore = await lockFundAccountBalance(tx, fundAccountId);
    if (balanceBefore.minus(amount).lt(0)) {
      continue;
    }

    const result = await createFundAccountLedgerEntry(
      tx,
      {
        ...params,
        fundAccountId,
        direction: "DEBIT",
      },
      balanceBefore,
      amount,
    );

    await tx.fundAccount.update({
      where: { id: fundAccountId },
      data: buildFundAccountUpdateData(result.balanceAfter, { totalOutflowDelta: amount }),
    });

    return {
      journal: result.journal,
      fundAccountId,
      balanceAfter: result.balanceAfter.toNumber(),
    };
  }

  throw new Error("No active fund account has enough available balance for this withdrawal");
}
