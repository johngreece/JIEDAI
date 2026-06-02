import { prisma } from "@/lib/prisma";
import { FUNDER_COOPERATION_LABELS } from "@/lib/funder-cooperation";

interface StatementRow {
  date: string;
  occurredAt: string;
  type: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

interface StatementSummary {
  funderId: string;
  funderName: string;
  cooperationMode: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  closingBalance: number;
  totalInflow: number;
  totalOutflow: number;
  totalInterest: number;
  totalWithdrawn: number;
  rows: StatementRow[];
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function dateOnly(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseMetadata(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatDate(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function formatDateTime(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
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

function describeInterestSettlement(
  fallbackDescription: string,
  metadataJson: string | null,
  amount: number,
) {
  const metadata = parseMetadata(metadataJson);
  const settlementNo = text(metadata.settlementNo);
  if (!settlementNo) return fallbackDescription;

  const parts = [`收益结算入账：${settlementNo}`];
  const cycleStart = formatDate(metadata.cycleStart);
  const cycleEnd = formatDate(metadata.cycleEnd);
  if (cycleStart && cycleEnd) parts.push(`周期 ${cycleStart} 至 ${cycleEnd}`);
  parts.push(`利息 €${amount.toFixed(2)}`);

  const paidAt = formatDateTime(metadata.paidAt);
  if (paidAt) parts.push(`平台打款 ${paidAt}`);

  const paymentRemark = text(metadata.paymentRemark);
  if (paymentRemark) parts.push(`打款备注 ${paymentRemark}`);

  return parts.join("，");
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function modeLabel(mode: string) {
  return FUNDER_COOPERATION_LABELS[mode as keyof typeof FUNDER_COOPERATION_LABELS] ?? mode;
}

export class FunderStatementService {
  static async generate(
    funderId: string,
    startDate: Date,
    endDate: Date
  ): Promise<StatementSummary> {
    const funder = await prisma.funder.findUniqueOrThrow({
      where: { id: funderId },
      select: {
        id: true,
        name: true,
        cooperationMode: true,
        accounts: {
          select: {
            id: true,
          },
        },
      },
    });

    const accountIds = funder.accounts.map((account) => account.id);
    if (!accountIds.length) {
      return {
        funderId: funder.id,
        funderName: funder.name,
        cooperationMode: funder.cooperationMode,
        periodStart: dateOnly(startDate),
        periodEnd: dateOnly(endDate),
        openingBalance: 0,
        closingBalance: 0,
        totalInflow: 0,
        totalOutflow: 0,
        totalInterest: 0,
        totalWithdrawn: 0,
        rows: [],
      };
    }

    const [journalRows, withdrawals] = await Promise.all([
      prisma.fundAccountJournal.findMany({
        where: {
          fundAccountId: { in: accountIds },
          createdAt: { gte: startDate, lte: endDate },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
      prisma.funderWithdrawal.findMany({
        where: {
          funderId,
          status: "APPROVED",
          approvedAt: { gte: startDate, lte: endDate },
        },
        select: {
          id: true,
          interestAmount: true,
        },
      }),
    ]);

    const interestByWithdrawalId = new Map(
      withdrawals.map((item) => [item.id, Number(item.interestAmount)]),
    );

    const rows: StatementRow[] = journalRows.map((entry) => {
      const amount = Number(entry.amount);
      const balance = Number(entry.balanceAfter);

      let type = entry.type;
      let description = entry.description || entry.referenceType;

      if (entry.type === "CAPITAL_INFLOW") {
        type = "资金注入";
      } else if (entry.type === "DISBURSEMENT") {
        type = "放款出账";
      } else if (entry.type === "REPAYMENT") {
        type = "回款入账";
      } else if (entry.type === "INTEREST_SETTLEMENT") {
        type = "收益确认入账";
        description = describeInterestSettlement(description, entry.metadataJson, amount);
      } else if (entry.type === "WITHDRAWAL") {
        type = "资金方提现";
        const interestAmount = interestByWithdrawalId.get(entry.referenceId) || 0;
        if (interestAmount > 0) {
          description = `${description} (利息 ${interestAmount.toFixed(2)})`;
        }
      }

      return {
        date: dateOnly(entry.createdAt),
        occurredAt: entry.createdAt.toISOString(),
        type,
        description,
        debit: entry.direction === "DEBIT" ? amount : 0,
        credit: entry.direction === "CREDIT" ? amount : 0,
        balance,
      };
    });

    const totalInflow = rows.reduce((sum, row) => sum + row.credit, 0);
    const totalOutflow = rows.reduce((sum, row) => sum + row.debit, 0);
    const totalWithdrawn = rows
      .filter((row) => row.type === "资金方提现")
      .reduce((sum, row) => sum + row.debit, 0);
    const totalInterest = rows
      .filter((row) => row.type === "收益确认入账")
      .reduce((sum, row) => sum + row.credit, 0);

    const rowsByAccount = new Map<string, typeof journalRows>();
    for (const entry of journalRows) {
      const accountRows = rowsByAccount.get(entry.fundAccountId) ?? [];
      accountRows.push(entry);
      rowsByAccount.set(entry.fundAccountId, accountRows);
    }

    const balanceSnapshots = await Promise.all(
      accountIds.map(async (accountId) => {
        const accountRows = rowsByAccount.get(accountId) ?? [];
        const firstEntry = accountRows[0];
        const lastEntry = accountRows[accountRows.length - 1];

        if (firstEntry && lastEntry) {
          return {
            openingBalance: Number(firstEntry.balanceBefore),
            closingBalance: Number(lastEntry.balanceAfter),
          };
        }

        const latestBeforeStart = await prisma.fundAccountJournal.findFirst({
          where: {
            fundAccountId: accountId,
            createdAt: { lt: startDate },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { balanceAfter: true },
        });

        const latestAtPeriodEnd = await prisma.fundAccountJournal.findFirst({
          where: {
            fundAccountId: accountId,
            createdAt: { lte: endDate },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { balanceAfter: true },
        });

        return {
          openingBalance: Number(latestBeforeStart?.balanceAfter || 0),
          closingBalance: Number(latestAtPeriodEnd?.balanceAfter || 0),
        };
      }),
    );

    const openingBalance = balanceSnapshots.reduce((sum, snapshot) => sum + snapshot.openingBalance, 0);
    const closingBalance = balanceSnapshots.reduce((sum, snapshot) => sum + snapshot.closingBalance, 0);

    return {
      funderId: funder.id,
      funderName: funder.name,
      cooperationMode: funder.cooperationMode,
      periodStart: dateOnly(startDate),
      periodEnd: dateOnly(endDate),
      openingBalance: round2(openingBalance),
      closingBalance: round2(closingBalance),
      totalInflow: round2(totalInflow),
      totalOutflow: round2(totalOutflow),
      totalInterest: round2(totalInterest),
      totalWithdrawn: round2(totalWithdrawn),
      rows,
    };
  }

  static toCSV(statement: StatementSummary): string {
    const BOM = "\uFEFF";
    const header = [
      `资金方对账单 - ${statement.funderName}`,
      `期间: ${statement.periodStart} 至 ${statement.periodEnd}`,
      `合作模式: ${modeLabel(statement.cooperationMode)}`,
      `期初余额: €${statement.openingBalance.toFixed(2)}`,
      `期末余额: €${statement.closingBalance.toFixed(2)}`,
      `总入账: €${statement.totalInflow.toFixed(2)}  总出账: €${statement.totalOutflow.toFixed(2)}  本期收益入账: €${statement.totalInterest.toFixed(2)}  总提现: €${statement.totalWithdrawn.toFixed(2)}`,
      "",
      "时间,类型,描述,出账(€),入账(€),余额(€)",
    ].join("\n");

    const dataRows = statement.rows.map((row) =>
      [
        csvCell(formatDateTime(row.occurredAt) ?? row.date),
        csvCell(row.type),
        csvCell(row.description),
        row.debit.toFixed(2),
        row.credit.toFixed(2),
        row.balance.toFixed(2),
      ].join(","),
    );

    return BOM + header + "\n" + dataRows.join("\n");
  }
}
