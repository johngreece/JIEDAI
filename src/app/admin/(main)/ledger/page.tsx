"use client";

import { useCallback, useEffect, useState } from "react";

type LedgerItem = {
  id: string;
  ledgerId: string;
  source: string;
  sourceLabel: string;
  entryNo: string;
  type: string;
  typeLabel: string;
  direction: string;
  movement: string;
  directionLabel: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  balanceScope: string;
  referenceType: string;
  referenceId: string;
  description: string | null;
  createdAt: string;
  counterpartyType: string;
  counterpartyName: string;
  customer?: { id: string; name: string } | null;
  funder?: { id: string; name: string } | null;
  fundAccount?: { id: string; accountName: string; bankName: string; accountNo: string } | null;
  operator?: { id: string; username: string; realName: string | null } | null;
};

type LedgerSummary = {
  totalAmount: number;
  inflowAmount: number;
  outflowAmount: number;
  customerAmount: number;
  funderAmount: number;
  customerCount: number;
  funderCount: number;
};

const TYPE_OPTIONS = [
  { value: "DISBURSEMENT", label: "放款 / 资金账户放款" },
  { value: "REPAYMENT", label: "还款 / 资金账户回款" },
  { value: "FEE", label: "费用收入" },
  { value: "PENALTY", label: "罚息收入" },
  { value: "EXTENSION_FEE", label: "展期费收入" },
  { value: "FUND_INFLOW", label: "总账资金方入金" },
  { value: "CAPITAL_INFLOW", label: "资金方账户入金" },
  { value: "INTEREST_SETTLEMENT", label: "资金方收益入账" },
  { value: "WITHDRAWAL", label: "资金方提现" },
  { value: "ADJUSTMENT", label: "调账" },
] as const;

function money(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function LedgerPage() {
  const [items, setItems] = useState<LedgerItem[]>([]);
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState("");
  const [movement, setMovement] = useState("");
  const [scope, setScope] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const buildQuery = useCallback((options?: { exportCsv?: boolean }) => {
    const params = new URLSearchParams({
      page: options?.exportCsv ? "1" : String(page),
      pageSize: options?.exportCsv ? "5000" : "30",
    });
    if (type) params.set("type", type);
    if (movement) params.set("movement", movement);
    if (scope !== "all") params.set("scope", scope);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (options?.exportCsv) params.set("format", "csv");
    return params;
  }, [endDate, movement, page, scope, startDate, type]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/ledger?${buildQuery()}`);
      if (!res.ok) {
        throw new Error("台账加载失败");
      }
      const data = await res.json();
      setItems(data.items ?? []);
      setSummary(data.summary ?? null);
      setTotal(data.total ?? 0);
    } catch (err) {
      setItems([]);
      setSummary(null);
      setTotal(0);
      setError(err instanceof Error ? err.message : "台账加载失败");
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  function downloadCsv() {
    window.open(`/api/ledger?${buildQuery({ exportCsv: true })}`, "_blank");
  }

  function resetDates() {
    setStartDate("");
    setEndDate("");
    setPage(1);
  }

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.ceil(total / 30);
  const periodLabel = startDate && endDate
    ? `${startDate} 至 ${endDate}`
    : startDate
      ? `${startDate} 起`
      : endDate
        ? `截至 ${endDate}`
        : "全部时间";

  return (
    <div className="space-y-6">
      <header className="panel-soft admin-page-header">
        <div className="admin-page-header__meta">
          <span className="admin-page-header__eyebrow">Ledger</span>
          <h1 className="admin-page-header__title">台账查询</h1>
          <p className="admin-page-header__description">统一查看客户台账与资金方账户流水，核对每一笔资金来源、去向和账前账后余额。</p>
        </div>
        <div className="admin-toolbar-group">
          <select
            className="admin-field w-40 text-sm"
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">全部账本</option>
            <option value="customer">客户台账</option>
            <option value="funder">资金方账户</option>
          </select>
          <select
            className="admin-field w-52 text-sm"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部类型</option>
            {TYPE_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            className="admin-field w-40 text-sm"
            value={movement}
            onChange={(e) => {
              setMovement(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部方向</option>
            <option value="INFLOW">入账</option>
            <option value="OUTFLOW">出账</option>
          </select>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
            起
            <input
              type="date"
              className="admin-field w-40 text-sm"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
            止
            <input
              type="date"
              className="admin-field w-40 text-sm"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <button onClick={resetDates} className="admin-btn admin-btn-ghost">
            全部时间
          </button>
          <button onClick={load} className="admin-btn admin-btn-secondary">
            刷新
          </button>
          <button onClick={downloadCsv} className="admin-btn admin-btn-primary" disabled={loading}>
            导出 CSV
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryTile label="当前筛选金额" value={money(summary?.totalAmount ?? 0)} />
        <SummaryTile label="入账合计" value={money(summary?.inflowAmount ?? 0)} tone="emerald" />
        <SummaryTile label="出账合计" value={money(summary?.outflowAmount ?? 0)} tone="red" />
        <SummaryTile label="客户台账金额" value={money(summary?.customerAmount ?? 0)} note={`${summary?.customerCount ?? 0} 笔`} />
        <SummaryTile label="资金方账户金额" value={money(summary?.funderAmount ?? 0)} note={`${summary?.funderCount ?? 0} 笔`} />
        <SummaryTile label="当前记录数" value={`${total.toLocaleString()} 笔`} />
      </section>

      <section className="table-shell admin-table-shell">
        <div className="admin-table-toolbar">
          <div>
            <div className="admin-table-title">资金流水明细</div>
            <p className="admin-table-note">客户台账和资金方账户余额的方向含义不同，系统已在“方向”和“来源”中拆开标注。</p>
          </div>
          <div className="text-right text-xs font-medium text-slate-500">
            <div>{periodLabel}</div>
            <div>每页 30 条</div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3">流水号</th>
                <th className="px-4 py-3">来源</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">方向</th>
                <th className="px-4 py-3">金额</th>
                <th className="px-4 py-3">余额变化</th>
                <th className="px-4 py-3">对象</th>
                <th className="px-4 py-3">说明</th>
                <th className="px-4 py-3">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                    加载中...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                    暂无记录
                  </td>
                </tr>
              ) : (
                items.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{entry.entryNo}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{entry.sourceLabel}</div>
                      <div className="text-xs text-slate-400">{entry.balanceScope}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{entry.typeLabel ?? entry.type}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                          entry.movement === "INFLOW"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-red-200 bg-red-50 text-red-700"
                        }`}
                      >
                        {entry.directionLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{money(entry.amount)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {money(entry.balanceBefore)} → {money(entry.balanceAfter)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <div className="font-medium">{entry.counterpartyName}</div>
                      <div className="text-xs text-slate-400">
                        {entry.counterpartyType}
                        {entry.fundAccount ? ` · ${entry.fundAccount.accountName}` : ""}
                      </div>
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-slate-500">{entry.description ?? "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Date(entry.createdAt).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 ? (
          <div className="admin-pagination">
            <span className="admin-pagination__summary">共 {total} 条记录</span>
            <div className="admin-pagination__controls">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="admin-btn admin-btn-ghost admin-btn-sm"
              >
                上一页
              </button>
              <span className="admin-pagination__status">
                {page}/{totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="admin-btn admin-btn-ghost admin-btn-sm"
              >
                下一页
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  note,
  tone = "slate",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "slate" | "emerald" | "red";
}) {
  const color =
    tone === "emerald" ? "text-emerald-600" : tone === "red" ? "text-red-600" : "text-slate-900";

  return (
    <div className="stat-tile rounded-2xl p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-2 text-lg font-bold ${color}`}>{value}</div>
      {note ? <div className="mt-1 text-xs text-slate-400">{note}</div> : null}
    </div>
  );
}
