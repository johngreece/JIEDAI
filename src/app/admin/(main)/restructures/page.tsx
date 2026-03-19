"use client";

import { useEffect, useState } from "react";

type Restructure = {
  id: string;
  applicationId: string;
  remainingPrincipal: number;
  remainingInterest: number;
  newTermValue: number;
  newTermUnit: string;
  newRate: number;
  applyReason: string | null;
  status: string;
  remark: string | null;
  approvedAt: string | null;
  createdAt: string;
};

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "待审批", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  APPROVED: { label: "已批准", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  REJECTED: { label: "已拒绝", cls: "bg-red-50 text-red-700 border-red-200" },
};

export default function RestructuresPage() {
  const [items, setItems] = useState<Restructure[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (status) params.set("status", status);
      const res = await fetch(`/api/restructures?${params}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch { /* */ } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [page, status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function approve(id: string, action: "APPROVE" | "REJECT") {
    setActing(id);
    try {
      const res = await fetch(`/api/restructures/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) alert(data.error ?? "操作失败");
      load();
    } catch { alert("操作失败"); } finally { setActing(null); }
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <header className="panel-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">贷款重组</h1>
          <p className="mt-1 text-sm text-slate-600">审批和管理贷款重组申请</p>
        </div>
        <div className="flex gap-2">
          <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">全部状态</option>
            <option value="PENDING">待审批</option>
            <option value="APPROVED">已批准</option>
            <option value="REJECTED">已拒绝</option>
          </select>
          <button onClick={load} className="btn-soft rounded-lg px-3 py-2 text-sm">刷新</button>
        </div>
      </header>

      <section className="table-shell overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-3">申请ID</th>
                <th className="px-4 py-3">剩余本金</th>
                <th className="px-4 py-3">剩余利息</th>
                <th className="px-4 py-3">新期限</th>
                <th className="px-4 py-3">新利率</th>
                <th className="px-4 py-3">原因</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">申请时间</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">加载中...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">暂无重组记录</td></tr>
              ) : items.map((r) => {
                const s = STATUS_MAP[r.status] ?? { label: r.status, cls: "bg-slate-50 text-slate-600 border-slate-200" };
                return (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{r.applicationId.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-slate-700">€{Number(r.remainingPrincipal).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-500">€{Number(r.remainingInterest).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-700">{r.newTermValue} {r.newTermUnit === "MONTH" ? "月" : "天"}</td>
                    <td className="px-4 py-3 text-slate-700">{(Number(r.newRate) * 100).toFixed(2)}%</td>
                    <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{r.applyReason ?? "-"}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span></td>
                    <td className="px-4 py-3 text-slate-500">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {r.status === "PENDING" ? (
                        <div className="flex gap-2">
                          <button disabled={acting === r.id} onClick={() => approve(r.id, "APPROVE")} className="text-emerald-600 hover:underline text-sm disabled:opacity-50">批准</button>
                          <button disabled={acting === r.id} onClick={() => approve(r.id, "REJECT")} className="text-red-600 hover:underline text-sm disabled:opacity-50">拒绝</button>
                        </div>
                      ) : r.remark ?? "-"}
                    </td>
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
