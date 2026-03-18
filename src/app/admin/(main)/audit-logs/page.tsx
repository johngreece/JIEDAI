"use client";

import { useEffect, useState } from "react";

type AuditItem = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  changeSummary: string | null;
  isAmountChange: boolean;
  ipAddress: string | null;
  createdAt: string;
  user: { id: string; username: string; realName: string | null };
};

const ACTION_MAP: Record<string, string> = {
  CREATE: "创建",
  UPDATE: "更新",
  DELETE: "删除",
  LOGIN: "登录",
  APPROVE: "审批",
  REJECT: "拒绝",
  DISBURSE: "放款",
  REPAY: "还款",
};

export default function AuditLogsPage() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [entityType, setEntityType] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "30" });
      if (entityType) params.set("entityType", entityType);
      const res = await fetch(`/api/audit-logs?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "加载失败");
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [page, entityType]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.ceil(total / 30);

  return (
    <div className="space-y-6">
      <header className="panel-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">审计日志</h1>
          <p className="mt-1 text-sm text-slate-600">系统操作审计追踪</p>
        </div>
        <div className="flex gap-2">
          <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }}>
            <option value="">全部类型</option>
            <option value="LoanApplication">借款申请</option>
            <option value="Disbursement">放款</option>
            <option value="Repayment">还款</option>
            <option value="Customer">客户</option>
            <option value="Contract">合同</option>
            <option value="User">用户</option>
          </select>
          <button onClick={load} className="btn-soft rounded-lg px-3 py-2 text-sm">刷新</button>
        </div>
      </header>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <section className="table-shell overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-3">时间</th>
                <th className="px-4 py-3">操作人</th>
                <th className="px-4 py-3">操作</th>
                <th className="px-4 py-3">实体类型</th>
                <th className="px-4 py-3">说明</th>
                <th className="px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">加载中...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">暂无日志</td></tr>
              ) : items.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-900">{log.user.realName ?? log.user.username}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${log.isAmountChange ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-50 text-slate-600 border-slate-200"}`}>
                      {ACTION_MAP[log.action] ?? log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{log.entityType}</td>
                  <td className="px-4 py-3 text-slate-700 max-w-xs truncate">{log.changeSummary ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{log.ipAddress ?? "-"}</td>
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
