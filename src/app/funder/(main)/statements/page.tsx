"use client";

import { useState } from "react";

function fmt(n: number) {
  return "€" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

interface StatementRow {
  date: string;
  type: string;
  description: string;
  inflow: number;
  outflow: number;
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
  const [start, setStart] = useState(firstDay.toISOString().slice(0, 10));
  const [end, setEnd] = useState(now.toISOString().slice(0, 10));
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/funder/statements?start=${start}&end=${end}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  function downloadCSV() {
    window.open(`/api/funder/statements?start=${start}&end=${end}&format=csv`, "_blank");
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
        <button onClick={load} disabled={loading} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">
          {loading ? "查询中..." : "查询"}
        </button>
        {data && (
          <button onClick={downloadCSV} className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-100">
            导出 CSV
          </button>
        )}
      </div>

      {/* Summary */}
      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="期初余额" value={fmt(data.openingBalance)} />
            <SummaryCard label="期末余额" value={fmt(data.closingBalance)} />
            <SummaryCard label="总入账" value={fmt(data.totalInflow)} color="emerald" />
            <SummaryCard label="总出账" value={fmt(data.totalOutflow + data.totalWithdrawn)} color="amber" />
          </div>

          {/* Rows */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-4 py-3">日期</th>
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
                    <td className="px-4 py-3 text-slate-500">{fmtDate(r.date)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${r.type === "入账" ? "bg-emerald-100 text-emerald-700" : r.type === "放款出账" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                        {r.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{r.description}</td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-600">{r.inflow > 0 ? fmt(r.inflow) : "-"}</td>
                    <td className="px-4 py-3 text-right font-medium text-red-500">{r.outflow > 0 ? fmt(r.outflow) : "-"}</td>
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
  const cls = color === "emerald" ? "text-emerald-600" : color === "amber" ? "text-amber-600" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}
