import Decimal from "decimal.js";
import { Prisma } from "@prisma/client";

export type FundAccountLedgerType =
  | "CAPITAL_INFLOW"
  | "DISBURSEMENT"
  | "REPAYMENT"
  | "WITHDRAWAL"
  | "ADJUSTMENT";

export type FundAccountLedgerDirection = "CREDIT" | "DEBIT";

function genEntryNo() {
  return `FA${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function writeFundAccountLedgerEntry(
  tx: Prisma.TransactionClient,
  params: {
    fundAccountId: string;
    type: FundAccountLedgerType;
    direction: FundAccountLedgerDirection;
    amount: number | Decimal;
    referenceType: string;
    referenceId: string;
    operatorId?: string | null;
    description?: string;
    metadata?: Record<string, unknown> | null;
  }
) {
  const amount = new Decimal(params.amount.toString());
  if (!amount.gt(0)) {
    throw new Error("Fund account journal amount must be greater than 0");
  }

  const lastEntry = await tx.fundAccountJournal.findFirst({
    where: { fundAccountId: params.fundAccountId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  const balanceBefore = lastEntry
    ? new Decimal(lastEntry.balanceAfter.toString())
    : new Decimal(
        (
          await tx.fundAccount.findUnique({
            where: { id: params.fundAccountId },
            select: { balance: true },
          })
        )?.balance?.toString() ?? "0"
      );

  const balanceAfter =
    params.direction === "CREDIT"
      ? balanceBefore.plus(amount)
      : balanceBefore.minus(amount);

  if (balanceAfter.lt(0)) {
    throw new Error("Fund account balance would become negative");
  }

  return tx.fundAccountJournal.create({
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
}
