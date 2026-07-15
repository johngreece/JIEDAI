import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";

import {
  compareMoney,
  createFinding,
  evaluateBalanceChain,
  expectEntry,
  expectNoEntry,
  money,
  type ReconciliationEntry,
  type ReconciliationFindingDraft,
} from "@/lib/finance-reconciliation";
import { prisma } from "@/lib/prisma";
import { InAppNotificationService } from "./in-app-notification.service";

const DISBURSED_STATUSES = new Set(["PAID", "CONFIRMED"]);
const HISTORY_START = new Date(0);

type ReconciliationSummary = {
  scannedAt: string;
  counts: {
    fundAccounts: number;
    fundJournalEntries: number;
    customerLedgerEntries: number;
    disbursements: number;
    repayments: number;
    capitalInflows: number;
    funderWithdrawals: number;
    interestSettlements: number;
  };
  findingsByCode: Record<string, number>;
};

function addMoney(map: Map<string, Decimal>, key: string, value: Prisma.Decimal | number | string) {
  map.set(key, (map.get(key) ?? money(0)).plus(money(value.toString())));
}

function subtractMoney(
  map: Map<string, Decimal>,
  key: string,
  value: Prisma.Decimal | number | string,
) {
  map.set(key, (map.get(key) ?? money(0)).minus(money(value.toString())));
}

function asJournalEntry(entry: {
  id: string;
  type: string;
  direction: string;
  amount: Prisma.Decimal;
  balanceBefore: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  fundAccountId: string;
}): ReconciliationEntry {
  return {
    id: entry.id,
    type: entry.type,
    direction: entry.direction,
    amount: entry.amount.toString(),
    balanceBefore: entry.balanceBefore.toString(),
    balanceAfter: entry.balanceAfter.toString(),
    ownerId: entry.fundAccountId,
  };
}

function asCustomerLedgerEntry(entry: {
  id: string;
  type: string;
  direction: string;
  amount: Prisma.Decimal;
  balanceBefore: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  customerId: string | null;
}): ReconciliationEntry {
  return {
    id: entry.id,
    type: entry.type,
    direction: entry.direction,
    amount: entry.amount.toString(),
    balanceBefore: entry.balanceBefore.toString(),
    balanceAfter: entry.balanceAfter.toString(),
    ownerId: entry.customerId,
  };
}

function countByCode(findings: ReconciliationFindingDraft[]) {
  return findings.reduce<Record<string, number>>((result, finding) => {
    result[finding.code] = (result[finding.code] ?? 0) + 1;
    return result;
  }, {});
}

async function inspectCurrentState() {
  const [
    fundAccounts,
    fundJournalEntries,
    customerLedgerEntries,
    disbursements,
    repayments,
    capitalInflows,
    funderWithdrawals,
    interestSettlements,
  ] = await Promise.all([
    prisma.fundAccount.findMany({
      select: {
        id: true,
        balance: true,
        totalInflow: true,
        totalOutflow: true,
        totalProfit: true,
      },
      orderBy: { id: "asc" },
    }),
    prisma.fundAccountJournal.findMany({
      select: {
        id: true,
        fundAccountId: true,
        type: true,
        direction: true,
        amount: true,
        balanceBefore: true,
        balanceAfter: true,
        referenceType: true,
        referenceId: true,
        createdAt: true,
      },
      orderBy: [{ fundAccountId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.ledgerEntry.findMany({
      select: {
        id: true,
        customerId: true,
        type: true,
        direction: true,
        amount: true,
        balanceBefore: true,
        balanceAfter: true,
        referenceType: true,
        referenceId: true,
        createdAt: true,
      },
      orderBy: [{ customerId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.disbursement.findMany({
      select: {
        id: true,
        status: true,
        applicationId: true,
        fundAccountId: true,
        amount: true,
        feeAmount: true,
        netAmount: true,
        application: { select: { customerId: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.repayment.findMany({
      select: {
        id: true,
        status: true,
        amount: true,
        principalPart: true,
        interestPart: true,
        feePart: true,
        penaltyPart: true,
        plan: { select: { applicationId: true } },
        allocations: { select: { amount: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.capitalInflow.findMany({
      select: { id: true, fundAccountId: true, amount: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.funderWithdrawal.findMany({
      select: { id: true, accountId: true, amount: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.funderInterestSettlement.findMany({
      select: { id: true, fundAccountId: true, interestAmount: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const findings: ReconciliationFindingDraft[] = [];
  const journalByReference = new Map(
    fundJournalEntries.map((entry) => [
      `${entry.referenceType}:${entry.referenceId}`,
      asJournalEntry(entry),
    ]),
  );
  const ledgerByReference = new Map(
    customerLedgerEntries.map((entry) => [
      `${entry.type}:${entry.referenceType}:${entry.referenceId}`,
      asCustomerLedgerEntry(entry),
    ]),
  );
  const disbursementByApplication = new Map(
    disbursements.map((item) => [item.applicationId, item]),
  );

  const expectedBalance = new Map<string, Decimal>();
  const expectedInflow = new Map<string, Decimal>();
  const expectedOutflow = new Map<string, Decimal>();
  const expectedProfit = new Map<string, Decimal>();

  for (const disbursement of disbursements) {
    const journal = journalByReference.get(`disbursement:${disbursement.id}`);
    const loanLedger = ledgerByReference.get(`DISBURSEMENT:disbursement:${disbursement.id}`);
    const feeLedger = ledgerByReference.get(`FEE:disbursement:${disbursement.id}`);

    if (!DISBURSED_STATUSES.has(disbursement.status)) {
      findings.push(
        ...expectNoEntry({
          code: "DISBURSEMENT_JOURNAL_WITHOUT_FINAL_STATUS",
          entityType: "disbursement",
          entityId: disbursement.id,
          label: "Fund journal entry",
          actual: journal,
          recommendedAction: "Review the disbursement status transition and source payment evidence before approving a compensating entry.",
        }),
        ...expectNoEntry({
          code: "DISBURSEMENT_LEDGER_WITHOUT_FINAL_STATUS",
          entityType: "disbursement",
          entityId: disbursement.id,
          label: "Customer disbursement ledger entry",
          actual: loanLedger,
          recommendedAction: "Review the disbursement status transition and customer contract before approving a compensating entry.",
        }),
        ...expectNoEntry({
          code: "DISBURSEMENT_FEE_WITHOUT_FINAL_STATUS",
          entityType: "disbursement",
          entityId: disbursement.id,
          label: "Customer fee ledger entry",
          actual: feeLedger,
          recommendedAction: "Review the fee event and disbursement status before approving a compensating entry.",
        }),
      );
      continue;
    }

    findings.push(
      ...expectEntry({
        code: "DISBURSEMENT_FUND_JOURNAL",
        entityType: "disbursement",
        entityId: disbursement.id,
        label: "Fund disbursement journal entry",
        expected: {
          type: "DISBURSEMENT",
          direction: "DEBIT",
          amount: disbursement.netAmount.toString(),
          ownerId: disbursement.fundAccountId,
        },
        actual: journal,
        recommendedAction: "Verify bank payment evidence and the atomic disbursement transaction; create only an approved compensating entry if required.",
      }),
      ...expectEntry({
        code: "DISBURSEMENT_CUSTOMER_LEDGER",
        entityType: "disbursement",
        entityId: disbursement.id,
        label: "Customer disbursement ledger entry",
        expected: {
          type: "DISBURSEMENT",
          direction: "CREDIT",
          amount: disbursement.amount.toString(),
          ownerId: disbursement.application.customerId,
        },
        actual: loanLedger,
        recommendedAction: "Verify the signed contract principal and payment evidence; create only an approved compensating entry if required.",
      }),
    );

    if (money(disbursement.feeAmount.toString()).gt(0)) {
      findings.push(
        ...expectEntry({
          code: "DISBURSEMENT_FEE_LEDGER",
          entityType: "disbursement",
          entityId: disbursement.id,
          label: "Customer upfront fee ledger entry",
          expected: {
            type: "FEE",
            direction: "DEBIT",
            amount: disbursement.feeAmount.toString(),
            ownerId: disbursement.application.customerId,
          },
          actual: feeLedger,
          recommendedAction: "Verify the signed fee terms; create only an approved compensating entry if required.",
        }),
      );
    } else {
      findings.push(
        ...expectNoEntry({
          code: "ZERO_FEE_LEDGER_PRESENT",
          entityType: "disbursement",
          entityId: disbursement.id,
          label: "Zero-value fee ledger entry",
          actual: feeLedger,
          recommendedAction: "Verify the contract fee terms and document why the unexpected fee entry exists.",
        }),
      );
    }

    subtractMoney(expectedBalance, disbursement.fundAccountId, disbursement.netAmount);
    addMoney(expectedOutflow, disbursement.fundAccountId, disbursement.netAmount);
  }

  for (const repayment of repayments) {
    const disbursement = disbursementByApplication.get(repayment.plan.applicationId);
    const customerId = disbursement?.application.customerId;
    const fundAccountId = disbursement?.fundAccountId;
    const journal = journalByReference.get(`repayment:${repayment.id}`);
    const ledger = ledgerByReference.get(`REPAYMENT:repayment:${repayment.id}`);

    if (repayment.status !== "CONFIRMED") {
      findings.push(
        ...expectNoEntry({
          code: "REPAYMENT_JOURNAL_WITHOUT_CONFIRMATION",
          entityType: "repayment",
          entityId: repayment.id,
          label: "Fund repayment journal entry",
          actual: journal,
          recommendedAction: "Review repayment confirmation evidence and the status transition before approving a compensating entry.",
        }),
        ...expectNoEntry({
          code: "REPAYMENT_LEDGER_WITHOUT_CONFIRMATION",
          entityType: "repayment",
          entityId: repayment.id,
          label: "Customer repayment ledger entry",
          actual: ledger,
          recommendedAction: "Review repayment confirmation evidence before approving a compensating entry.",
        }),
      );
      continue;
    }

    if (!customerId || !fundAccountId) {
      findings.push(
        createFinding({
          code: "REPAYMENT_SOURCE_DISBURSEMENT_MISSING",
          severity: "ERROR",
          entityType: "repayment",
          entityId: repayment.id,
          expectedValue: repayment.plan.applicationId,
          actualValue: "MISSING",
          description: "Confirmed repayment has no source disbursement and fund account",
          owner: "OPERATIONS",
          recommendedAction: "Link the repayment plan to the correct disbursed application before any finance correction is approved.",
        }),
      );
      continue;
    }

    const partTotal = money(repayment.principalPart.toString())
      .plus(repayment.interestPart.toString())
      .plus(repayment.feePart.toString())
      .plus(repayment.penaltyPart.toString());
    const allocationTotal = repayment.allocations.reduce(
      (sum, allocation) => sum.plus(allocation.amount.toString()),
      money(0),
    );

    findings.push(
      ...compareMoney({
        code: "REPAYMENT_PART_TOTAL",
        entityType: "repayment",
        entityId: repayment.id,
        label: "Repayment component total",
        expected: repayment.amount.toString(),
        actual: partTotal,
        recommendedAction: "Review the repayment allocation calculation and confirmation audit trail.",
      }),
      ...compareMoney({
        code: "REPAYMENT_ALLOCATION_TOTAL",
        entityType: "repayment",
        entityId: repayment.id,
        label: "Repayment schedule allocation total",
        expected: repayment.amount.toString(),
        actual: allocationTotal,
        recommendedAction: "Review the repayment schedule allocation records and confirmation transaction.",
      }),
      ...expectEntry({
        code: "REPAYMENT_FUND_JOURNAL",
        entityType: "repayment",
        entityId: repayment.id,
        label: "Fund repayment journal entry",
        expected: {
          type: "REPAYMENT",
          direction: "CREDIT",
          amount: repayment.amount.toString(),
          ownerId: fundAccountId,
        },
        actual: journal,
        recommendedAction: "Verify receipt evidence and the atomic repayment confirmation; create only an approved compensating entry if required.",
      }),
      ...expectEntry({
        code: "REPAYMENT_CUSTOMER_LEDGER",
        entityType: "repayment",
        entityId: repayment.id,
        label: "Customer repayment ledger entry",
        expected: {
          type: "REPAYMENT",
          direction: "DEBIT",
          amount: repayment.amount.toString(),
          ownerId: customerId,
        },
        actual: ledger,
        recommendedAction: "Verify receipt evidence and customer confirmation; create only an approved compensating entry if required.",
      }),
    );

    addMoney(expectedBalance, fundAccountId, repayment.amount);
    addMoney(expectedProfit, fundAccountId, partTotal.minus(repayment.principalPart.toString()));
  }

  for (const inflow of capitalInflows) {
    const original = journalByReference.get(`capital_inflow:${inflow.id}`);
    const reversal = journalByReference.get(`capital_inflow_reversal:${inflow.id}`);

    if (inflow.status === "CONFIRMED") {
      findings.push(
        ...expectEntry({
          code: "CAPITAL_INFLOW_JOURNAL",
          entityType: "capital_inflow",
          entityId: inflow.id,
          label: "Capital inflow journal entry",
          expected: {
            type: "CAPITAL_INFLOW",
            direction: "CREDIT",
            amount: inflow.amount.toString(),
            ownerId: inflow.fundAccountId,
          },
          actual: original,
          recommendedAction: "Verify the incoming bank transfer and approval audit trail; create only an approved compensating entry if required.",
        }),
        ...expectNoEntry({
          code: "ACTIVE_INFLOW_HAS_REVERSAL",
          entityType: "capital_inflow",
          entityId: inflow.id,
          label: "Capital inflow reversal",
          actual: reversal,
          recommendedAction: "Review the inflow cancellation history and restore a consistent business status through an approved process.",
        }),
      );
      addMoney(expectedBalance, inflow.fundAccountId, inflow.amount);
      addMoney(expectedInflow, inflow.fundAccountId, inflow.amount);
      continue;
    }

    if (inflow.status === "CANCELLED" && original) {
      findings.push(
        ...expectEntry({
          code: "CANCELLED_INFLOW_ORIGINAL",
          entityType: "capital_inflow",
          entityId: inflow.id,
          label: "Cancelled capital inflow original journal entry",
          expected: {
            type: "CAPITAL_INFLOW",
            direction: "CREDIT",
            amount: inflow.amount.toString(),
            ownerId: inflow.fundAccountId,
          },
          actual: original,
          recommendedAction: "Verify the original incoming transfer and cancellation evidence.",
        }),
        ...expectEntry({
          code: "CAPITAL_INFLOW_REVERSAL",
          entityType: "capital_inflow",
          entityId: inflow.id,
          label: "Capital inflow reversal journal entry",
          expected: {
            type: "ADJUSTMENT",
            direction: "DEBIT",
            amount: inflow.amount.toString(),
            ownerId: inflow.fundAccountId,
          },
          actual: reversal,
          recommendedAction: "Verify cancellation evidence and create only an approved compensating reversal if required.",
        }),
      );
      continue;
    }

    findings.push(
      ...expectNoEntry({
        code: "CAPITAL_INFLOW_WITHOUT_CONFIRMATION",
        entityType: "capital_inflow",
        entityId: inflow.id,
        label: "Capital inflow journal entry",
        actual: original,
        recommendedAction: "Review the inflow approval history and bank evidence.",
      }),
      ...expectNoEntry({
        code: "CAPITAL_INFLOW_REVERSAL_WITHOUT_ORIGINAL",
        entityType: "capital_inflow",
        entityId: inflow.id,
        label: "Capital inflow reversal",
        actual: reversal,
        recommendedAction: "Review the inflow cancellation history and bank evidence.",
      }),
    );
  }

  for (const withdrawal of funderWithdrawals) {
    const journal = journalByReference.get(`funder_withdrawal:${withdrawal.id}`);
    if (withdrawal.status !== "APPROVED") {
      findings.push(
        ...expectNoEntry({
          code: "WITHDRAWAL_JOURNAL_WITHOUT_APPROVAL",
          entityType: "funder_withdrawal",
          entityId: withdrawal.id,
          label: "Funder withdrawal journal entry",
          actual: journal,
          recommendedAction: "Stop payment and verify the withdrawal approval audit trail.",
        }),
      );
      continue;
    }

    if (!withdrawal.accountId) {
      findings.push(
        createFinding({
          code: "WITHDRAWAL_ACCOUNT_MISSING",
          severity: "ERROR",
          entityType: "funder_withdrawal",
          entityId: withdrawal.id,
          expectedValue: "fund account id",
          actualValue: "MISSING",
          description: "Approved funder withdrawal has no debited account",
          owner: "FINANCE",
          recommendedAction: "Verify payment evidence and identify the debited fund account before further withdrawals are approved.",
        }),
      );
      continue;
    }

    findings.push(
      ...expectEntry({
        code: "WITHDRAWAL_FUND_JOURNAL",
        entityType: "funder_withdrawal",
        entityId: withdrawal.id,
        label: "Funder withdrawal journal entry",
        expected: {
          type: "WITHDRAWAL",
          direction: "DEBIT",
          amount: withdrawal.amount.toString(),
          ownerId: withdrawal.accountId,
        },
        actual: journal,
        recommendedAction: "Verify withdrawal approval and bank payment evidence; create only an approved compensating entry if required.",
      }),
    );
    subtractMoney(expectedBalance, withdrawal.accountId, withdrawal.amount);
    addMoney(expectedOutflow, withdrawal.accountId, withdrawal.amount);
  }

  for (const settlement of interestSettlements) {
    const journal = journalByReference.get(`funder_interest_settlement:${settlement.id}`);
    if (settlement.status !== "CONFIRMED_BY_FUNDER") {
      findings.push(
        ...expectNoEntry({
          code: "INTEREST_SETTLEMENT_WITHOUT_CONFIRMATION",
          entityType: "funder_interest_settlement",
          entityId: settlement.id,
          label: "Funder interest settlement journal entry",
          actual: journal,
          recommendedAction: "Verify funder confirmation evidence before any settlement income is recognized.",
        }),
      );
      continue;
    }

    findings.push(
      ...expectEntry({
        code: "INTEREST_SETTLEMENT_FUND_JOURNAL",
        entityType: "funder_interest_settlement",
        entityId: settlement.id,
        label: "Funder interest settlement journal entry",
        expected: {
          type: "INTEREST_SETTLEMENT",
          direction: "CREDIT",
          amount: settlement.interestAmount.toString(),
          ownerId: settlement.fundAccountId,
        },
        actual: journal,
        recommendedAction: "Verify funder confirmation and settlement evidence; create only an approved compensating entry if required.",
      }),
    );
    addMoney(expectedBalance, settlement.fundAccountId, settlement.interestAmount);
    addMoney(expectedProfit, settlement.fundAccountId, settlement.interestAmount);
  }

  const journalGroups = new Map<string, ReconciliationEntry[]>();
  for (const entry of fundJournalEntries) {
    const group = journalGroups.get(entry.fundAccountId) ?? [];
    group.push(asJournalEntry(entry));
    journalGroups.set(entry.fundAccountId, group);
  }

  for (const account of fundAccounts) {
    findings.push(
      ...evaluateBalanceChain({
        entityType: "fund_account",
        entityId: account.id,
        entries: journalGroups.get(account.id) ?? [],
        recordedBalance: account.balance.toString(),
        codePrefix: "FUND_JOURNAL",
        label: "Fund account journal",
      }),
      ...compareMoney({
        code: "FUND_ACCOUNT_BUSINESS_BALANCE",
        entityType: "fund_account",
        entityId: account.id,
        label: "Fund account balance from business events",
        expected: expectedBalance.get(account.id) ?? 0,
        actual: account.balance.toString(),
        recommendedAction: "Freeze outgoing payments and compare every business event with its journal entry before approving a corrective event.",
      }),
      ...compareMoney({
        code: "FUND_ACCOUNT_TOTAL_INFLOW",
        entityType: "fund_account",
        entityId: account.id,
        label: "Fund account total inflow",
        expected: expectedInflow.get(account.id) ?? 0,
        actual: account.totalInflow.toString(),
        recommendedAction: "Verify confirmed and cancelled capital inflows and their reversal audit trail.",
      }),
      ...compareMoney({
        code: "FUND_ACCOUNT_TOTAL_OUTFLOW",
        entityType: "fund_account",
        entityId: account.id,
        label: "Fund account total outflow",
        expected: expectedOutflow.get(account.id) ?? 0,
        actual: account.totalOutflow.toString(),
        recommendedAction: "Verify paid disbursements and approved withdrawals against bank evidence.",
      }),
      ...compareMoney({
        code: "FUND_ACCOUNT_TOTAL_PROFIT",
        entityType: "fund_account",
        entityId: account.id,
        label: "Fund account total profit",
        expected: expectedProfit.get(account.id) ?? 0,
        actual: account.totalProfit.toString(),
        recommendedAction: "Verify confirmed repayment income components and confirmed funder interest settlements.",
      }),
    );
  }

  const customerLedgerGroups = new Map<string, ReconciliationEntry[]>();
  for (const entry of customerLedgerEntries) {
    if (!entry.customerId) {
      findings.push(
        createFinding({
          code: "CUSTOMER_LEDGER_OWNER_MISSING",
          severity: "ERROR",
          entityType: "ledger_entry",
          entityId: entry.id,
          expectedValue: "customer id",
          actualValue: "MISSING",
          description: "Customer ledger entry has no customer owner",
          owner: "ENGINEERING",
          recommendedAction: "Trace the source business event and link ownership through an approved corrective process.",
        }),
      );
      continue;
    }
    const group = customerLedgerGroups.get(entry.customerId) ?? [];
    group.push(asCustomerLedgerEntry(entry));
    customerLedgerGroups.set(entry.customerId, group);
  }

  for (const [customerId, entries] of customerLedgerGroups) {
    findings.push(
      ...evaluateBalanceChain({
        entityType: "customer",
        entityId: customerId,
        entries,
        codePrefix: "CUSTOMER_LEDGER",
        label: "Customer ledger",
        allowNegative: true,
      }),
    );
  }

  const knownReferences: Record<string, Set<string>> = {
    capital_inflow: new Set(capitalInflows.map((item) => item.id)),
    capital_inflow_reversal: new Set(capitalInflows.map((item) => item.id)),
    disbursement: new Set(disbursements.map((item) => item.id)),
    repayment: new Set(repayments.map((item) => item.id)),
    funder_withdrawal: new Set(funderWithdrawals.map((item) => item.id)),
    funder_interest_settlement: new Set(interestSettlements.map((item) => item.id)),
  };

  for (const entry of fundJournalEntries) {
    const knownIds = knownReferences[entry.referenceType];
    if (knownIds && !knownIds.has(entry.referenceId)) {
      findings.push(
        createFinding({
          code: "ORPHAN_FUND_JOURNAL_REFERENCE",
          severity: "ERROR",
          entityType: "fund_journal_entry",
          entityId: entry.id,
          expectedValue: `${entry.referenceType}:${entry.referenceId}`,
          actualValue: "BUSINESS RECORD MISSING",
          description: "Fund journal entry points to a missing business record",
          owner: "ENGINEERING",
          recommendedAction: "Investigate database history and source evidence; do not delete or rewrite the journal entry.",
        }),
      );
    }
  }

  for (const entry of customerLedgerEntries) {
    const knownIds = knownReferences[entry.referenceType];
    if (knownIds && !knownIds.has(entry.referenceId)) {
      findings.push(
        createFinding({
          code: "ORPHAN_CUSTOMER_LEDGER_REFERENCE",
          severity: "ERROR",
          entityType: "ledger_entry",
          entityId: entry.id,
          expectedValue: `${entry.referenceType}:${entry.referenceId}`,
          actualValue: "BUSINESS RECORD MISSING",
          description: "Customer ledger entry points to a missing business record",
          owner: "ENGINEERING",
          recommendedAction: "Investigate database history and source evidence; do not delete or rewrite the ledger entry.",
        }),
      );
    }
  }

  const summary: ReconciliationSummary = {
    scannedAt: new Date().toISOString(),
    counts: {
      fundAccounts: fundAccounts.length,
      fundJournalEntries: fundJournalEntries.length,
      customerLedgerEntries: customerLedgerEntries.length,
      disbursements: disbursements.length,
      repayments: repayments.length,
      capitalInflows: capitalInflows.length,
      funderWithdrawals: funderWithdrawals.length,
      interestSettlements: interestSettlements.length,
    },
    findingsByCode: countByCode(findings),
  };

  return { findings, summary };
}

async function loadRun(runKey: string) {
  return prisma.financeReconciliationRun.findUnique({
    where: { runKey },
    include: { findings: { orderBy: [{ status: "asc" }, { createdAt: "asc" }] } },
  });
}

async function persistRun(runKey: string, triggeredById?: string) {
  const existing = await loadRun(runKey);
  if (existing && existing.status !== "RUNNING") return existing;
  if (existing) throw new Error(`Finance reconciliation ${runKey} is already running`);

  let run;
  try {
    run = await prisma.financeReconciliationRun.create({
      data: {
        runKey,
        periodStart: HISTORY_START,
        periodEnd: new Date(),
        triggeredById: triggeredById ?? null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const concurrentRun = await loadRun(runKey);
      if (concurrentRun?.status === "RUNNING") {
        throw new Error(`Finance reconciliation ${runKey} is already running`);
      }
      return concurrentRun;
    }
    throw error;
  }

  try {
    const { findings, summary } = await inspectCurrentState();
    const ignoredByFingerprint = new Map<
      string,
      { resolvedById: string | null; resolvedAt: Date | null; resolutionNote: string | null }
    >();

    if (findings.length > 0) {
      const ignored = await prisma.financeReconciliationFinding.findMany({
        where: {
          status: "IGNORED",
          fingerprint: { in: findings.map((finding) => finding.fingerprint) },
        },
        orderBy: { updatedAt: "desc" },
        select: {
          fingerprint: true,
          resolvedById: true,
          resolvedAt: true,
          resolutionNote: true,
        },
      });
      for (const item of ignored) {
        if (!ignoredByFingerprint.has(item.fingerprint)) {
          ignoredByFingerprint.set(item.fingerprint, item);
        }
      }
    }

    const openFindingCount = findings.filter(
      (finding) => !ignoredByFingerprint.has(finding.fingerprint),
    ).length;

    await prisma.$transaction(async (tx) => {
      if (findings.length > 0) {
        await tx.financeReconciliationFinding.createMany({
          data: findings.map((finding) => {
            const ignored = ignoredByFingerprint.get(finding.fingerprint);
            return {
              runId: run.id,
              ...finding,
              entityId: finding.entityId ?? null,
              expectedValue: finding.expectedValue ?? null,
              actualValue: finding.actualValue ?? null,
              status: ignored ? "IGNORED" : "OPEN",
              resolvedById: ignored?.resolvedById ?? null,
              resolvedAt: ignored?.resolvedAt ?? null,
              resolutionNote: ignored?.resolutionNote ?? null,
            };
          }),
        });
      }

      await tx.financeReconciliationRun.update({
        where: { id: run.id },
        data: {
          status: findings.length === 0 ? "CLEAN" : "DIFFERENCE",
          findingCount: findings.length,
          openFindingCount,
          summaryJson: JSON.stringify(summary),
          completedAt: new Date(),
        },
      });
    });
  } catch (error) {
    await prisma.financeReconciliationRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      },
    });
    throw error;
  }

  return loadRun(runKey);
}

async function notifyOnOpenFindings(run: NonNullable<Awaited<ReturnType<typeof loadRun>>>) {
  if (run.openFindingCount === 0) return;
  await InAppNotificationService.notifyAdmins({
    type: "FINANCE_RECONCILIATION_DIFFERENCE",
    templateCode: `FINANCE_RECONCILIATION_${run.runKey}`,
    title: "资金对账发现差异",
    content: `对账批次 ${run.runKey} 发现 ${run.openFindingCount} 个未处理差异。已暂停将该批次视为财务闭环，请进入资金对账页面逐项复核。`,
  });
}

export class FinanceReconciliationService {
  static inspectCurrent = inspectCurrentState;

  static runManual(triggeredById: string) {
    return persistRun(`manual:${new Date().toISOString()}:${randomUUID()}`, triggeredById);
  }

  static async runDaily() {
    const run = await persistRun(`daily:${new Date().toISOString().slice(0, 10)}`);
    if (!run) throw new Error("Finance reconciliation run could not be loaded");
    await notifyOnOpenFindings(run);
    return run;
  }

  static async runDailyOrThrow() {
    const run = await this.runDaily();
    if (run.openFindingCount > 0) {
      throw new Error(
        `Finance reconciliation found ${run.openFindingCount} unresolved difference(s)`,
      );
    }
    if (run.status === "FAILED") {
      throw new Error(run.errorMessage ?? "Finance reconciliation failed");
    }
    if (!["CLEAN", "DIFFERENCE"].includes(run.status)) {
      throw new Error(`Finance reconciliation ended in unexpected status ${run.status}`);
    }
    return run;
  }
}
