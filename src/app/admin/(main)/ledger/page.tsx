"use client";

import { useEffect, useState } from "react";

type LedgerItem = {
  id: string;
  entryNo: string;
  type: string;
  direction: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: string;
  referenceId: string;
  description: string | null;
  createdAt: string;
  customer?: { id: string; name: string } | null;
  operator?: { id: string; username: string; realName: string | null } | null;
};

const TYPE_MAP: Record<string, string> = {
  DISBURSEMENT: "放款",
  REPAYMENT: "还款",
  FEE: "费用",
  PENALTY: "罚息",
  EXTENSION_FEE: "展期费",
  FUND_INFLOW: "入金",
  ADJUSTMENT: "调账",
};

export default function LedgerPage() {
  const [items, setItems] = useState<LedgerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState("");
  const [direction, setDirection] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "30" });
      if (type) params.set("type", type);
      if (direction) params.set("direction", direction);
      const res = await fetch(`/api/ledger?${params}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch { /* */ } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [page, type, direction]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.ceil(total / 30);

  return (
    <div className="space-y-6">
      <header className="panel-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">台账查询</h1>
          <p className="mt-1 text-sm text-slate-600">查看所有资金进出流水</p>
        </div>
        <div className="flex gap-2">
          <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">全部类型</option>
            {Object.entries(TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={direction} onChange={(e) => { setDirection(e.target.value); setPage(1); }}>
            <option value="">全部方向</option>
            <option value="DEBIT">入账 (DEBIT)</option>
            <option value="CREDIT">出账 (CREDIT)</option>
          </select>
          <button onClick={load} className="btn-soft rounded-lg px-3 py-2 text-sm">刷新</button>
        </div>
      </header>

      <section className="table-shell overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-3">流水号</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">方向</th>
                <th className="px-4 py-3">金额</th>
                <th className="px-4 py-3">余额变化</th>
                <th className="px-4 py-3">客户</th>
                <th className="px-4 py-3">说明</th>
                <th className="px-4 py-3">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">加载中...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">暂无记录</td></tr>
              ) : items.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{e.entryNo}</td>
                  <td className="px-4 py-3 text-slate-700">{TYPE_MAP[e.type] ?? e.type}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${e.direction === "DEBIT" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                      {e.direction === "DEBIT" ? "入账" : "出账"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">€{e.amount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{e.balanceBefore.toLocaleString()} → {e.balanceAfter.toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-700">{e.customer?.name ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{e.description ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
            <span className="text-slate-500">共 {total} 条</span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-2 py-1 disabled:opacity-30">上一页</button>
              <span className="px-2 py-1 text-slate-600">{page}/{totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="rounded border px-2 py-1 disabled:opacity-30">下一页</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
