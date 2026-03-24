import { prisma } from "@/lib/prisma";

interface StatementRow {
  date: string;
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
          where: { isActive: true },
          select: {
            id: true,
            balance: true,
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
        periodStart: startDate.toISOString().split("T")[0],
        periodEnd: endDate.toISOString().split("T")[0],
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
      } else if (entry.type === "WITHDRAWAL") {
        type = "资金方提现";
        const interestAmount = interestByWithdrawalId.get(entry.referenceId) || 0;
        if (interestAmount > 0) {
          description = `${description} (利息 ${interestAmount.toFixed(2)})`;
        }
      }

      return {
        date: entry.createdAt.toISOString().split("T")[0],
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
    const totalInterest = withdrawals.reduce((sum, item) => sum + Number(item.interestAmount), 0);

    const openingBalanceByAccount = new Map<string, number>();
    for (const accountId of accountIds) {
      const firstEntry = journalRows.find((entry) => entry.fundAccountId === accountId);
      if (firstEntry) {
        openingBalanceByAccount.set(accountId, Number(firstEntry.balanceBefore));
        continue;
      }

      const latestBefore = await prisma.fundAccountJournal.findFirst({
        where: {
          fundAccountId: accountId,
          createdAt: { lt: startDate },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { balanceAfter: true },
      });

      openingBalanceByAccount.set(accountId, Number(latestBefore?.balanceAfter || 0));
    }

    const openingBalance = Array.from(openingBalanceByAccount.values()).reduce((sum, value) => sum + value, 0);
    const closingBalance = funder.accounts.reduce((sum, account) => sum + Number(account.balance), 0);

    return {
      funderId: funder.id,
      funderName: funder.name,
      cooperationMode: funder.cooperationMode,
      periodStart: startDate.toISOString().split("T")[0],
      periodEnd: endDate.toISOString().split("T")[0],
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
      `合作模式: ${statement.cooperationMode}`,
      `期初余额: €${statement.openingBalance.toFixed(2)}`,
      `期末余额: €${statement.closingBalance.toFixed(2)}`,
      `总入账: €${statement.totalInflow.toFixed(2)}  总出账: €${statement.totalOutflow.toFixed(2)}  总提现: €${statement.totalWithdrawn.toFixed(2)}`,
      "",
      "日期,类型,描述,出账(€),入账(€),余额(€)",
    ].join("\n");

    const dataRows = statement.rows.map((row) =>
      [
        row.date,
        row.type,
        `"${row.description}"`,
        row.debit.toFixed(2),
        row.credit.toFixed(2),
        row.balance.toFixed(2),
      ].join(","),
    );

    return BOM + header + "\n" + dataRows.join("\n");
  }
}
