"use client";

import { useCallback, useEffect, useState } from "react";

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

  const load = useCallback(async () => {
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
  }, [entityType, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.ceil(total / 30);

  return (
    <div className="space-y-6">
      <header className="panel-soft admin-page-header">
        <div className="admin-page-header__meta">
          <span className="admin-page-header__eyebrow">Audit Logs</span>
          <h1 className="admin-page-header__title">审计日志</h1>
          <p className="admin-page-header__description">跟踪后台关键操作、金额变动与责任归属，便于排查异常和回溯行为。</p>
        </div>
        <div className="admin-toolbar-group">
          <select
            className="admin-field w-44 text-sm"
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部类型</option>
            <option value="LoanApplication">借款申请</option>
            <option value="Disbursement">放款</option>
            <option value="Repayment">还款</option>
            <option value="Customer">客户</option>
            <option value="Contract">合同</option>
            <option value="User">用户</option>
          </select>
          <button onClick={load} className="admin-btn admin-btn-secondary">刷新</button>
        </div>
      </header>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="table-shell admin-table-shell">
        <div className="admin-table-toolbar">
          <div>
            <div className="admin-table-title">操作审计列表</div>
            <p className="admin-table-note">金额类操作会用更明显的标签，方便财务和管理员优先关注。</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3">时间</th>
                <th className="px-4 py-3">操作人</th>
                <th className="px-4 py-3">动作</th>
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
              ) : (
                items.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-900">{log.user.realName ?? log.user.username}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${log.isAmountChange ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-50 text-slate-600 border-slate-200"}`}>
                        {ACTION_MAP[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{log.entityType}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-slate-700">{log.changeSummary ?? "-"}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{log.ipAddress ?? "-"}</td>
                  </tr>
                ))
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
