"use client";

import { useCallback, useEffect, useState } from "react";

function fmt(n: number) {
  return "€" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function dateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface StatementRow {
  date: string;
  occurredAt: string;
  type: string;
  description: string;
  credit: number;
  debit: number;
  balance: number;
}
interface StatementData {
  funderName: string;
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

export default function StatementsPage() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const [start, setStart] = useState(dateInput(firstDay));
  const [end, setEnd] = useState(dateInput(now));
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/funder/statements?start=${start}&end=${end}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "对账单加载失败");
    } finally {
      setLoading(false);
    }
  }, [end, start]);

  useEffect(() => {
    void load();
  }, [load]);

  function downloadCSV() {
    window.open(`/api/funder/statements?start=${start}&end=${end}&format=csv`, "_blank");
  }

  function setRange(range: "month" | "30d") {
    const today = new Date();
    const nextStart = range === "month"
      ? new Date(today.getFullYear(), today.getMonth(), 1)
      : new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
    setStart(dateInput(nextStart));
    setEnd(dateInput(today));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">对账单</h1>
        <p className="text-sm text-slate-500">查询并导出资金往来对账单</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <label className="block">
          <span className="text-sm text-slate-600">开始日期</span>
          <input type="date" className="mt-1 block w-44 rounded-lg border border-slate-300 px-3 py-2 text-sm" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">结束日期</span>
          <input type="date" className="mt-1 block w-44 rounded-lg border border-slate-300 px-3 py-2 text-sm" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <button onClick={() => setRange("month")} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
          本月
        </button>
        <button onClick={() => setRange("30d")} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
          近30天
        </button>
        <button onClick={load} disabled={loading} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">
          {loading ? "查询中..." : "查询"}
        </button>
        <button onClick={downloadCSV} disabled={loading} className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
          导出 CSV
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        当前期间：{data ? `${data.periodStart} 至 ${data.periodEnd}` : `${start} 至 ${end}`}
      </div>

      {/* Summary */}
      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <SummaryCard label="期初余额" value={fmt(data.openingBalance)} />
            <SummaryCard label="期末余额" value={fmt(data.closingBalance)} />
            <SummaryCard label="总入账" value={fmt(data.totalInflow)} color="emerald" />
            <SummaryCard label="总出账" value={fmt(data.totalOutflow)} color="amber" />
            <SummaryCard label="收益入账" value={fmt(data.totalInterest)} color="emerald" />
            <SummaryCard label="本期提现" value={fmt(data.totalWithdrawn)} color="red" />
          </div>

          {/* Rows */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-4 py-3">时间</th>
                  <th className="px-4 py-3">类型</th>
                  <th className="px-4 py-3">说明</th>
                  <th className="px-4 py-3 text-right">入账</th>
                  <th className="px-4 py-3 text-right">出账</th>
                  <th className="px-4 py-3 text-right">余额</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">该时间段内无交易记录</td></tr>
                ) : data.rows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{fmtDateTime(r.occurredAt ?? r.date)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${r.type === "入账" ? "bg-emerald-100 text-emerald-700" : r.type === "放款出账" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                        {r.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{r.description}</td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-600">{r.credit > 0 ? fmt(r.credit) : "-"}</td>
                    <td className="px-4 py-3 text-right font-medium text-red-500">{r.debit > 0 ? fmt(r.debit) : "-"}</td>
                    <td className="px-4 py-3 text-right font-medium">{fmt(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  const cls =
    color === "emerald"
      ? "text-emerald-600"
      : color === "amber"
        ? "text-amber-600"
        : color === "red"
          ? "text-red-600"
          : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}
