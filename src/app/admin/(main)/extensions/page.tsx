"use client";

import { useEffect, useState } from "react";

type Extension = {
  id: string;
  applicationId: string;
  extensionDays: number;
  extensionFee: number;
  applyReason: string | null;
  status: string;
  createdAt: string;
  application?: { applicationNo: string; customer?: { name: string } };
};

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "待审批", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  APPROVED: { label: "已批准", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  REJECTED: { label: "已拒绝", cls: "bg-red-50 text-red-700 border-red-200" },
};

export default function ExtensionsPage() {
  const [items, setItems] = useState<Extension[]>([]);
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
      const res = await fetch(`/api/extensions?${params}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [page, status]);

  async function approve(id: string, action: "APPROVE" | "REJECT") {
    setActing(id);
    try {
      const res = await fetch(`/api/extensions/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) alert(data.error ?? "操作失败");
      await load();
    } catch {
      alert("操作失败");
    } finally {
      setActing(null);
    }
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <header className="panel-soft admin-page-header">
        <div className="admin-page-header__meta">
          <span className="admin-page-header__eyebrow">Extensions</span>
          <h1 className="admin-page-header__title">展期管理</h1>
          <p className="admin-page-header__description">统一审批借款展期申请，核对展期天数、费用与申请原因。</p>
        </div>
        <div className="admin-toolbar-group">
          <select
            className="admin-field w-40 text-sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部状态</option>
            <option value="PENDING">待审批</option>
            <option value="APPROVED">已批准</option>
            <option value="REJECTED">已拒绝</option>
          </select>
          <button onClick={load} className="admin-btn admin-btn-secondary">刷新</button>
        </div>
      </header>

      <section className="table-shell admin-table-shell">
        <div className="admin-table-toolbar">
          <div>
            <div className="admin-table-title">展期申请列表</div>
            <p className="admin-table-note">审批通过后可进入后续费用结算与计划调整流程。</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3">申请编号</th>
                <th className="px-4 py-3">客户</th>
                <th className="px-4 py-3">展期天数</th>
                <th className="px-4 py-3">展期费用</th>
                <th className="px-4 py-3">原因</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">申请时间</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">加载中...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">暂无展期记录</td></tr>
              ) : (
                items.map((extension) => {
                  const statusMeta = STATUS_MAP[extension.status] ?? { label: extension.status, cls: "bg-slate-50 text-slate-600 border-slate-200" };
                  return (
                    <tr key={extension.id}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{extension.application?.applicationNo ?? extension.applicationId.slice(0, 8)}</td>
                      <td className="px-4 py-3 text-slate-900">{extension.application?.customer?.name ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-700">{extension.extensionDays} 天</td>
                      <td className="px-4 py-3 text-slate-700">EUR {extension.extensionFee.toLocaleString()}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-slate-500">{extension.applyReason ?? "-"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusMeta.cls}`}>{statusMeta.label}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{new Date(extension.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        {extension.status === "PENDING" ? (
                          <div className="admin-btn-group">
                            <button disabled={acting === extension.id} onClick={() => approve(extension.id, "APPROVE")} className="text-sm text-emerald-600 hover:underline disabled:opacity-50">批准</button>
                            <button disabled={acting === extension.id} onClick={() => approve(extension.id, "REJECT")} className="text-sm text-red-600 hover:underline disabled:opacity-50">拒绝</button>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 ? (
          <div className="admin-pagination">
            <span className="admin-pagination__summary">共 {total} 条</span>
            <div className="admin-pagination__controls">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="admin-btn admin-btn-ghost admin-btn-sm">上一页</button>
              <span className="admin-pagination__status">{page}/{totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="admin-btn admin-btn-ghost admin-btn-sm">下一页</button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
