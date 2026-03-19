import { prisma } from "@/lib/prisma";

/**
 * 资金方对账单服务
 * 生成月度/季度对账明细，支持 CSV 格式导出
 */

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

export class FunderStatementService {
  /**
   * 生成指定期间的对账单
   */
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
        monthlyRate: true,
        weeklyRate: true,
        accounts: { where: { isActive: true } },
      },
    });

    const accountIds = funder.accounts.map((a) => a.id);
    const rows: StatementRow[] = [];
    let totalInflow = 0;
    let totalOutflow = 0;
    let totalInterest = 0;
    let totalWithdrawn = 0;

    // 1. 资金注入
    if (accountIds.length) {
      const inflows = await prisma.capitalInflow.findMany({
        where: {
          fundAccountId: { in: accountIds },
          status: "CONFIRMED",
          inflowDate: { gte: startDate, lte: endDate },
        },
        orderBy: { inflowDate: "asc" },
      });
      for (const inf of inflows) {
        const amt = Number(inf.amount);
        totalInflow += amt;
        rows.push({
          date: inf.inflowDate.toISOString().split("T")[0],
          type: "资金注入",
          description: `${inf.channel} 入账`,
          debit: 0,
          credit: amt,
          balance: 0,
        });
      }
    }

    // 2. 放款记录
    if (accountIds.length) {
      const disbursements = await prisma.disbursement.findMany({
        where: {
          fundAccountId: { in: accountIds },
          disbursedAt: { gte: startDate, lte: endDate },
          status: { in: ["PAID", "CONFIRMED"] },
        },
        orderBy: { disbursedAt: "asc" },
        select: {
          disbursementNo: true,
          netAmount: true,
          feeAmount: true,
          disbursedAt: true,
          application: { select: { customer: { select: { name: true } } } },
        },
      });
      for (const d of disbursements) {
        const amt = Number(d.netAmount);
        totalOutflow += amt;
        rows.push({
          date: d.disbursedAt?.toISOString().split("T")[0] ?? "",
          type: "放款出账",
          description: `${d.disbursementNo} / ${d.application?.customer?.name ?? "-"}`,
          debit: amt,
          credit: 0,
          balance: 0,
        });
      }
    }

    // 3. 提现记录
    const withdrawals = await prisma.funderWithdrawal.findMany({
      where: {
        funderId,
        status: "APPROVED",
        approvedAt: { gte: startDate, lte: endDate },
      },
      orderBy: { approvedAt: "asc" },
    });
    for (const w of withdrawals) {
      const amt = Number(w.amount);
      const interest = Number(w.interestAmount);
      totalWithdrawn += amt;
      if (interest > 0) totalInterest += interest;
      const typeLabel =
        w.type === "INTEREST" ? "利息提现" : w.type === "PRINCIPAL" ? "本金提现" : "本息提现";
      rows.push({
        date: w.approvedAt?.toISOString().split("T")[0] ?? "",
        type: typeLabel,
        description: `${w.remark || typeLabel}`,
        debit: amt,
        credit: 0,
        balance: 0,
      });
    }

    // 按日期排序 & 计算余额
    rows.sort((a, b) => a.date.localeCompare(b.date));
    let runningBalance = funder.accounts.reduce((s, a) => s + Number(a.balance), 0)
      + totalOutflow + totalWithdrawn - totalInflow; // reverse to find opening
    const openingBalance = runningBalance;
    for (const row of rows) {
      runningBalance = runningBalance + row.credit - row.debit;
      row.balance = Math.round(runningBalance * 100) / 100;
    }
    const closingBalance = runningBalance;

    return {
      funderId: funder.id,
      funderName: funder.name,
      cooperationMode: funder.cooperationMode,
      periodStart: startDate.toISOString().split("T")[0],
      periodEnd: endDate.toISOString().split("T")[0],
      openingBalance: Math.round(openingBalance * 100) / 100,
      closingBalance: Math.round(closingBalance * 100) / 100,
      totalInflow,
      totalOutflow,
      totalInterest,
      totalWithdrawn,
      rows,
    };
  }

  /**
   * 将对账单转为 CSV 字符串
   */
  static toCSV(statement: StatementSummary): string {
    const BOM = "\uFEFF";
    const header = [
      `资金方对账单 — ${statement.funderName}`,
      `期间：${statement.periodStart} 至 ${statement.periodEnd}`,
      `合作模式：${statement.cooperationMode === "FIXED_MONTHLY" ? "固定月息" : "业务量结算"}`,
      `期初余额：€${statement.openingBalance.toFixed(2)}`,
      `期末余额：€${statement.closingBalance.toFixed(2)}`,
      `总入账：€${statement.totalInflow.toFixed(2)}  总出账：€${statement.totalOutflow.toFixed(2)}  总提现：€${statement.totalWithdrawn.toFixed(2)}`,
      "",
      "日期,类型,描述,出账(€),入账(€),余额(€)",
    ].join("\n");

    const dataRows = statement.rows.map((r) =>
      [r.date, r.type, `"${r.description}"`, r.debit.toFixed(2), r.credit.toFixed(2), r.balance.toFixed(2)].join(",")
    );

    return BOM + header + "\n" + dataRows.join("\n");
  }
}
