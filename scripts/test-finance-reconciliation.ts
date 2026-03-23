import Decimal from "decimal.js";
import { loadEnvConfig } from "@next/env";
import { prisma } from "@/lib/prisma";
import { SettlementService } from "@/services/settlement.service";

loadEnvConfig(process.cwd());

function decimal(value: Decimal.Value | null | undefined) {
  return new Decimal(value ?? 0);
}

function money(value: Decimal.Value | null | undefined) {
  return decimal(value).toDecimalPlaces(2).toFixed(2);
}

function sameMoney(left: Decimal.Value | null | undefined, right: Decimal.Value | null | undefined) {
  return money(left) === money(right);
}

function parseDate(value: string | undefined, fallback: Date) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date;
}

async function main() {
  const defaultStart = new Date();
  defaultStart.setDate(defaultStart.getDate() - 90);
  defaultStart.setHours(0, 0, 0, 0);

  const start = parseDate(process.env.RECON_START, defaultStart);
  const end = parseDate(process.env.RECON_END, new Date());

  const period = { start, end };
  const summary = await SettlementService.generateReport(period);

  const [disbursements, repayments, ledgerEntries, outstandingAgg] = await Promise.all([
    prisma.disbursement.findMany({
      where: {
        disbursedAt: { gte: start, lt: end },
        status: { in: ["PAID", "CONFIRMED"] },
      },
      select: {
        id: true,
        amount: true,
        feeAmount: true,
        netAmount: true,
        application: {
          select: {
            customerId: true,
          },
        },
      },
      orderBy: { disbursedAt: "asc" },
    }),
    prisma.repayment.findMany({
      where: {
        receivedAt: { gte: start, lt: end },
        status: "CONFIRMED",
      },
      select: {
        id: true,
        amount: true,
        principalPart: true,
        interestPart: true,
        feePart: true,
        penaltyPart: true,
        allocations: {
          select: {
            amount: true,
          },
        },
        plan: {
          select: {
            applicationId: true,
          },
        },
      },
      orderBy: { receivedAt: "asc" },
    }),
    prisma.ledgerEntry.findMany({
      where: {
        createdAt: { gte: start, lt: end },
        referenceType: { in: ["disbursement", "repayment"] },
      },
      select: {
        id: true,
        type: true,
        direction: true,
        amount: true,
        referenceType: true,
        referenceId: true,
        customerId: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.repaymentScheduleItem.aggregate({
      where: {
        status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
        plan: { status: "ACTIVE" },
      },
      _sum: { remaining: true },
    }),
  ]);

  const applicationIds = Array.from(new Set(repayments.map((item) => item.plan.applicationId)));

  const applications = await prisma.loanApplication.findMany({
    where: {
      id: {
        in: applicationIds,
      },
    },
    select: {
      id: true,
      customerId: true,
    },
  });

  const customerByApplicationId = new Map(applications.map((item) => [item.id, item.customerId]));

  const findings: string[] = [];

  const rawDisbursedAmount = disbursements.reduce((sum, item) => sum.plus(item.amount), new Decimal(0));
  const rawDisbursedFee = disbursements.reduce((sum, item) => sum.plus(item.feeAmount), new Decimal(0));
  const rawDisbursedNet = disbursements.reduce((sum, item) => sum.plus(item.netAmount), new Decimal(0));

  const rawRepaidAmount = repayments.reduce((sum, item) => sum.plus(item.amount), new Decimal(0));
  const rawRepaidPrincipal = repayments.reduce((sum, item) => sum.plus(item.principalPart), new Decimal(0));
  const rawRepaidInterest = repayments.reduce((sum, item) => sum.plus(item.interestPart), new Decimal(0));
  const rawRepaidFee = repayments.reduce((sum, item) => sum.plus(item.feePart), new Decimal(0));
  const rawRepaidPenalty = repayments.reduce((sum, item) => sum.plus(item.penaltyPart), new Decimal(0));

  const ledgerDebitTotal = ledgerEntries
    .filter((item) => item.direction === "DEBIT")
    .reduce((sum, item) => sum.plus(item.amount), new Decimal(0));
  const ledgerCreditTotal = ledgerEntries
    .filter((item) => item.direction === "CREDIT")
    .reduce((sum, item) => sum.plus(item.amount), new Decimal(0));

  const expectedSummary = {
    disbursedCount: disbursements.length,
    disbursedAmount: money(rawDisbursedAmount),
    disbursedFee: money(rawDisbursedFee),
    disbursedNet: money(rawDisbursedNet),
    repaidCount: repayments.length,
    repaidAmount: money(rawRepaidAmount),
    repaidPrincipal: money(rawRepaidPrincipal),
    repaidInterest: money(rawRepaidInterest),
    repaidFee: money(rawRepaidFee),
    repaidPenalty: money(rawRepaidPenalty),
    totalIncome: money(rawDisbursedFee.plus(rawRepaidInterest).plus(rawRepaidFee).plus(rawRepaidPenalty)),
    totalOutflow: money(rawDisbursedNet),
    capitalRecovery: money(rawRepaidPrincipal),
    periodNetCashflow: money(rawRepaidAmount.minus(rawDisbursedNet)),
    currentOutstandingBalance: money(outstandingAgg._sum.remaining),
    ledgerDebitTotal: money(ledgerDebitTotal),
    ledgerCreditTotal: money(ledgerCreditTotal),
  };

  for (const [key, expected] of Object.entries(expectedSummary)) {
    const actual = String(summary[key as keyof typeof summary]);
    if (String(expected) !== actual) {
      findings.push(`summary.${key} expected ${expected}, got ${actual}`);
    }
  }

  const ledgerByReference = new Map<string, typeof ledgerEntries>();
  for (const entry of ledgerEntries) {
    const key = `${entry.referenceType}:${entry.referenceId}`;
    const current = ledgerByReference.get(key) || [];
    current.push(entry);
    ledgerByReference.set(key, current);
  }

  for (const item of disbursements) {
    const entries = ledgerByReference.get(`disbursement:${item.id}`) || [];
    const disbursementEntries = entries.filter(
      (entry) => entry.type === "DISBURSEMENT" && entry.direction === "CREDIT"
    );
    if (disbursementEntries.length !== 1) {
      findings.push(`disbursement ${item.id} has ${disbursementEntries.length} DISBURSEMENT/CREDIT ledger entries`);
    } else {
      const entry = disbursementEntries[0];
      if (!sameMoney(entry.amount, item.amount)) {
        findings.push(`disbursement ${item.id} ledger amount mismatch: ${money(entry.amount)} vs ${money(item.amount)}`);
      }
      if (entry.customerId !== item.application.customerId) {
        findings.push(`disbursement ${item.id} ledger customer mismatch`);
      }
    }

    const feeAmount = decimal(item.feeAmount);
    const feeEntries = entries.filter((entry) => entry.type === "FEE" && entry.direction === "DEBIT");
    if (feeAmount.gt(0)) {
      if (feeEntries.length !== 1) {
        findings.push(`disbursement ${item.id} expected one FEE/DEBIT ledger entry, got ${feeEntries.length}`);
      } else if (!sameMoney(feeEntries[0].amount, feeAmount)) {
        findings.push(`disbursement ${item.id} fee ledger mismatch: ${money(feeEntries[0].amount)} vs ${money(feeAmount)}`);
      }
    } else if (feeEntries.length > 0) {
      findings.push(`disbursement ${item.id} has unexpected fee ledger entries`);
    }
  }

  for (const item of repayments) {
    const partsSum = decimal(item.principalPart)
      .plus(item.interestPart)
      .plus(item.feePart)
      .plus(item.penaltyPart);
    if (!sameMoney(partsSum, item.amount)) {
      findings.push(`repayment ${item.id} parts sum ${money(partsSum)} does not match amount ${money(item.amount)}`);
    }

    const allocationsSum = item.allocations.reduce((sum, entry) => sum.plus(entry.amount), new Decimal(0));
    if (!sameMoney(allocationsSum, item.amount)) {
      findings.push(
        `repayment ${item.id} allocation sum ${money(allocationsSum)} does not match amount ${money(item.amount)}`
      );
    }

    const entries = ledgerByReference.get(`repayment:${item.id}`) || [];
    const repaymentEntries = entries.filter(
      (entry) => entry.type === "REPAYMENT" && entry.direction === "DEBIT"
    );
    if (repaymentEntries.length !== 1) {
      findings.push(`repayment ${item.id} has ${repaymentEntries.length} REPAYMENT/DEBIT ledger entries`);
      continue;
    }

    const entry = repaymentEntries[0];
    if (!sameMoney(entry.amount, item.amount)) {
      findings.push(`repayment ${item.id} ledger amount mismatch: ${money(entry.amount)} vs ${money(item.amount)}`);
    }
    const expectedCustomerId = customerByApplicationId.get(item.plan.applicationId);
    if (!expectedCustomerId) {
      findings.push(`repayment ${item.id} missing application/customer mapping`);
    } else if (entry.customerId !== expectedCustomerId) {
      findings.push(`repayment ${item.id} ledger customer mismatch`);
    }
  }

  if (findings.length) {
    throw new Error(`Finance reconciliation failed:\n- ${findings.join("\n- ")}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        period: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
        counts: {
          disbursements: disbursements.length,
          repayments: repayments.length,
          ledgerEntries: ledgerEntries.length,
        },
        summarySnapshot: {
          disbursedAmount: summary.disbursedAmount,
          repaidAmount: summary.repaidAmount,
          totalIncome: summary.totalIncome,
          currentOutstandingBalance: summary.currentOutstandingBalance,
          ledgerDebitTotal: summary.ledgerDebitTotal,
          ledgerCreditTotal: summary.ledgerCreditTotal,
        },
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

void main().catch(async (error) => {
  console.error("[test-finance-reconciliation] FAILED");
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
