import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import Decimal from "decimal.js";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

function genLedgerNo() {
  return `LEFIX${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function genFundJournalNo() {
  return `FAFIX${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function decimal(value: Decimal.Value | null | undefined) {
  return new Decimal(value ?? 0);
}

function sameMoney(left: Decimal.Value | null | undefined, right: Decimal.Value | null | undefined) {
  return decimal(left).toDecimalPlaces(4).equals(decimal(right).toDecimalPlaces(4));
}

async function ensureLedgerEntry(params: {
  type: string;
  direction: string;
  amount: Decimal.Value;
  referenceType: string;
  referenceId: string;
  customerId: string;
  operatorId: string | null;
  description: string;
  createdAt: Date;
}) {
  const matches = await prisma.ledgerEntry.findMany({
    where: {
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      type: params.type,
      direction: params.direction,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  if (matches.length > 1) {
    throw new Error(
      `Duplicate ledger entries for ${params.referenceType}:${params.referenceId} ${params.type}/${params.direction}`,
    );
  }

  if (matches.length === 1) {
    const current = matches[0];
    if (
      sameMoney(current.amount, params.amount) &&
      current.customerId === params.customerId &&
      current.operatorId === params.operatorId
    ) {
      return { id: current.id, action: "kept" as const };
    }

    const updated = await prisma.ledgerEntry.update({
      where: { id: current.id },
      data: {
        amount: decimal(params.amount).toDecimalPlaces(4).toNumber(),
        customerId: params.customerId,
        operatorId: params.operatorId,
        description: params.description,
        createdAt: params.createdAt,
      },
    });
    return { id: updated.id, action: "updated" as const };
  }

  const created = await prisma.ledgerEntry.create({
    data: {
      entryNo: genLedgerNo(),
      type: params.type,
      direction: params.direction,
      amount: decimal(params.amount).toDecimalPlaces(4).toNumber(),
      balanceBefore: 0,
      balanceAfter: 0,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      customerId: params.customerId,
      operatorId: params.operatorId,
      description: params.description,
      createdAt: params.createdAt,
    },
  });
  return { id: created.id, action: "created" as const };
}

async function ensureFundJournalEntry(params: {
  fundAccountId: string;
  type: string;
  direction: string;
  amount: Decimal.Value;
  referenceType: string;
  referenceId: string;
  operatorId: string | null;
  description: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}) {
  const matches = await prisma.fundAccountJournal.findMany({
    where: {
      fundAccountId: params.fundAccountId,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      type: params.type,
      direction: params.direction,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  if (matches.length > 1) {
    throw new Error(
      `Duplicate fund journal entries for ${params.referenceType}:${params.referenceId} ${params.type}/${params.direction}`,
    );
  }

  if (matches.length === 1) {
    const current = matches[0];
    if (sameMoney(current.amount, params.amount) && current.operatorId === params.operatorId) {
      return { id: current.id, action: "kept" as const };
    }

    const updated = await prisma.fundAccountJournal.update({
      where: { id: current.id },
      data: {
        amount: decimal(params.amount).toDecimalPlaces(4).toNumber(),
        operatorId: params.operatorId,
        description: params.description,
        metadataJson: params.metadata ? JSON.stringify(params.metadata) : null,
        createdAt: params.createdAt,
      },
    });
    return { id: updated.id, action: "updated" as const };
  }

  const created = await prisma.fundAccountJournal.create({
    data: {
      entryNo: genFundJournalNo(),
      fundAccountId: params.fundAccountId,
      type: params.type,
      direction: params.direction,
      amount: decimal(params.amount).toDecimalPlaces(4).toNumber(),
      balanceBefore: 0,
      balanceAfter: 0,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      operatorId: params.operatorId,
      description: params.description,
      metadataJson: params.metadata ? JSON.stringify(params.metadata) : null,
      createdAt: params.createdAt,
    },
  });
  return { id: created.id, action: "created" as const };
}

async function recomputeCustomerLedger(customerId: string) {
  const entries = await prisma.ledgerEntry.findMany({
    where: { customerId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  let balance = new Decimal(0);
  let updated = 0;

  for (const entry of entries) {
    const before = balance;
    balance =
      entry.direction === "CREDIT"
        ? balance.plus(entry.amount)
        : balance.minus(entry.amount);

    if (!sameMoney(entry.balanceBefore, before) || !sameMoney(entry.balanceAfter, balance)) {
      await prisma.ledgerEntry.update({
        where: { id: entry.id },
        data: {
          balanceBefore: before.toDecimalPlaces(4).toNumber(),
          balanceAfter: balance.toDecimalPlaces(4).toNumber(),
        },
      });
      updated += 1;
    }
  }

  return updated;
}

async function recomputeFundAccountJournal(fundAccountId: string) {
  const entries = await prisma.fundAccountJournal.findMany({
    where: { fundAccountId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  let balance = new Decimal(0);
  let updated = 0;

  for (const entry of entries) {
    const before = balance;
    balance =
      entry.direction === "CREDIT"
        ? balance.plus(entry.amount)
        : balance.minus(entry.amount);

    if (!sameMoney(entry.balanceBefore, before) || !sameMoney(entry.balanceAfter, balance)) {
      await prisma.fundAccountJournal.update({
        where: { id: entry.id },
        data: {
          balanceBefore: before.toDecimalPlaces(4).toNumber(),
          balanceAfter: balance.toDecimalPlaces(4).toNumber(),
        },
      });
      updated += 1;
    }
  }

  const [inflowAgg, disbursementAgg, repaymentRows] = await Promise.all([
    prisma.capitalInflow.aggregate({
      where: { fundAccountId, status: "CONFIRMED" },
      _sum: { amount: true },
    }),
    prisma.disbursement.aggregate({
      where: {
        fundAccountId,
        status: { in: ["PAID", "CONFIRMED"] },
        disbursedAt: { not: null },
      },
      _sum: { netAmount: true },
    }),
    prisma.repayment.findMany({
      where: {
        status: "CONFIRMED",
        plan: {
          applicationId: {
            in: (
              await prisma.disbursement.findMany({
                where: { fundAccountId },
                select: { applicationId: true },
              })
            ).map((item) => item.applicationId),
          },
        },
      },
      select: {
        interestPart: true,
        feePart: true,
        penaltyPart: true,
      },
    }),
  ]);

  const totalProfit = repaymentRows.reduce(
    (sum, item) =>
      sum.plus(decimal(item.interestPart)).plus(decimal(item.feePart)).plus(decimal(item.penaltyPart)),
    new Decimal(0),
  );

  await prisma.fundAccount.update({
    where: { id: fundAccountId },
    data: {
      balance: balance.toDecimalPlaces(4).toNumber(),
      totalInflow: decimal(inflowAgg._sum.amount).toDecimalPlaces(4).toNumber(),
      totalOutflow: decimal(disbursementAgg._sum.netAmount).toDecimalPlaces(4).toNumber(),
      totalProfit: totalProfit.toDecimalPlaces(4).toNumber(),
    },
  });

  return { updated, balance: balance.toFixed(4) };
}

async function main() {
  const touchedCustomers = new Set<string>();
  const touchedFundAccounts = new Set<string>();
  const actions: Record<string, number> = {
    ledgerCreated: 0,
    ledgerUpdated: 0,
    ledgerKept: 0,
    journalCreated: 0,
    journalUpdated: 0,
    journalKept: 0,
    customerBalancesUpdated: 0,
    fundJournalBalancesUpdated: 0,
  };

  const disbursements = await prisma.disbursement.findMany({
    where: {
      status: { in: ["PAID", "CONFIRMED"] },
      disbursedAt: { not: null },
    },
    include: {
      application: { select: { customerId: true } },
    },
    orderBy: [{ disbursedAt: "asc" }, { id: "asc" }],
  });

  for (const disbursement of disbursements) {
    if (!disbursement.disbursedAt) continue;

    const customerId = disbursement.application.customerId;
    touchedCustomers.add(customerId);
    touchedFundAccounts.add(disbursement.fundAccountId);

    const disbursementLedger = await ensureLedgerEntry({
      type: "DISBURSEMENT",
      direction: "CREDIT",
      amount: disbursement.amount,
      referenceType: "disbursement",
      referenceId: disbursement.id,
      customerId,
      operatorId: disbursement.operatorId,
      description: "Backfilled loan disbursement ledger",
      createdAt: disbursement.disbursedAt,
    });
    actions[`ledger${disbursementLedger.action[0].toUpperCase()}${disbursementLedger.action.slice(1)}`] += 1;

    if (decimal(disbursement.feeAmount).gt(0)) {
      const feeLedger = await ensureLedgerEntry({
        type: "FEE",
        direction: "DEBIT",
        amount: disbursement.feeAmount,
        referenceType: "disbursement",
        referenceId: disbursement.id,
        customerId,
        operatorId: disbursement.operatorId,
        description: "Backfilled upfront fee ledger",
        createdAt: disbursement.disbursedAt,
      });
      actions[`ledger${feeLedger.action[0].toUpperCase()}${feeLedger.action.slice(1)}`] += 1;
    }

    const journal = await ensureFundJournalEntry({
      fundAccountId: disbursement.fundAccountId,
      type: "DISBURSEMENT",
      direction: "DEBIT",
      amount: disbursement.netAmount,
      referenceType: "disbursement",
      referenceId: disbursement.id,
      operatorId: disbursement.operatorId,
      description: "Backfilled loan disbursement fund journal",
      createdAt: disbursement.disbursedAt,
      metadata: {
        applicationId: disbursement.applicationId,
        grossAmount: Number(disbursement.amount),
        feeAmount: Number(disbursement.feeAmount),
        netAmount: Number(disbursement.netAmount),
      },
    });
    actions[`journal${journal.action[0].toUpperCase()}${journal.action.slice(1)}`] += 1;
  }

  for (const customerId of touchedCustomers) {
    actions.customerBalancesUpdated += await recomputeCustomerLedger(customerId);
  }

  for (const fundAccountId of touchedFundAccounts) {
    const result = await recomputeFundAccountJournal(fundAccountId);
    actions.fundJournalBalancesUpdated += result.updated;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        touchedCustomers: touchedCustomers.size,
        touchedFundAccounts: touchedFundAccounts.size,
        actions,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("[repair-finance-ledger] FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
