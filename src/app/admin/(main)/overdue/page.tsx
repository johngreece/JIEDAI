"use client";

import { useEffect, useState } from "react";

type OverdueItem = {
  id: string;
  applicationId: string;
  scheduleItemId: string;
  overdueDays: number;
  overdueAmount: number;
  penaltyAmount: number;
  status: string;
  createdAt: string;
  application?: { applicationNo: string; customer?: { name: string; phone: string } };
};

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "逾期中", cls: "bg-red-50 text-red-700 border-red-200" },
  RESOLVED: { label: "已解决", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  WRITTEN_OFF: { label: "已核销", cls: "bg-slate-100 text-slate-500 border-slate-200" },
};

export default function OverduePage() {
  const [items, setItems] = useState<OverdueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (status) params.set("status", status);
      const res = await fetch(`/api/overdue?${params}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch { /* */ } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [page, status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runScan() {
    try {
      const res = await fetch("/api/overdue/scan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? "扫描失败"); return; }
      alert(`扫描完成：新增 ${data.newOverdue} 条，更新 ${data.updatedOverdue} 条`);
      load();
    } catch { alert("扫描失败"); }
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <header className="panel-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">逾期管理</h1>
          <p className="mt-1 text-sm text-slate-600">查看逾期记录与罚息计算</p>
        </div>
        <div className="flex gap-2">
          <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">全部状态</option>
            <option value="OPEN">逾期中</option>
            <option value="RESOLVED">已解决</option>
            <option value="WRITTEN_OFF">已核销</option>
          </select>
          <button onClick={load} className="btn-soft rounded-lg px-3 py-2 text-sm">刷新</button>
          <button onClick={runScan} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800">执行扫描</button>
        </div>
      </header>

      <section className="table-shell overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-3">申请编号</th>
                <th className="px-4 py-3">客户</th>
                <th className="px-4 py-3">逾期天数</th>
                <th className="px-4 py-3">逾期金额</th>
                <th className="px-4 py-3">罚息</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">发现时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">加载中...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">暂无逾期记录</td></tr>
              ) : items.map((o) => {
                const s = STATUS_MAP[o.status] ?? { label: o.status, cls: "bg-slate-50 text-slate-600 border-slate-200" };
                return (
                  <tr key={o.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{o.application?.applicationNo ?? o.applicationId.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-slate-900">{o.application?.customer?.name ?? "-"}</td>
                    <td className="px-4 py-3 font-semibold text-red-600">{o.overdueDays} 天</td>
                    <td className="px-4 py-3 text-slate-700">¥{o.overdueAmount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-amber-700">¥{o.penaltyAmount.toLocaleString()}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span></td>
                    <td className="px-4 py-3 text-slate-500">{new Date(o.createdAt).toLocaleDateString()}</td>
                  </tr>
                );
              })}
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
