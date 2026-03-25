"use client";

import { useCallback, useEffect, useState } from "react";

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (status) params.set("status", status);
      const res = await fetch(`/api/overdue?${params}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runScan() {
    try {
      const res = await fetch("/api/overdue/scan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "扫描失败");
        return;
      }
      alert(`扫描完成: 新增 ${data.newOverdue} 条，更新 ${data.updatedOverdue} 条`);
      await load();
    } catch {
      alert("扫描失败");
    }
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <header className="panel-soft admin-page-header">
        <div className="admin-page-header__meta">
          <span className="admin-page-header__eyebrow">Overdue Monitor</span>
          <h1 className="admin-page-header__title">逾期管理</h1>
          <p className="admin-page-header__description">跟踪逾期天数、逾期金额、罚息累计和当前处置状态。</p>
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
            <option value="OPEN">逾期中</option>
            <option value="RESOLVED">已解决</option>
            <option value="WRITTEN_OFF">已核销</option>
          </select>
          <button onClick={load} className="admin-btn admin-btn-secondary">
            刷新
          </button>
          <button onClick={runScan} className="admin-btn admin-btn-primary">
            执行扫描
          </button>
        </div>
      </header>

      <section className="table-shell admin-table-shell">
        <div className="admin-table-toolbar">
          <div>
            <div className="admin-table-title">逾期记录</div>
            <p className="admin-table-note">帮助管理端集中确认今日新增逾期与已处置项目。</p>
          </div>
          <div className="text-xs font-medium text-slate-500">每页 20 条</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
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
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    加载中...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    暂无逾期记录
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const statusMeta = STATUS_MAP[item.status] ?? {
                    label: item.status,
                    cls: "bg-slate-50 text-slate-600 border-slate-200",
                  };
                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">
                        {item.application?.applicationNo ?? item.applicationId.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 text-slate-900">{item.application?.customer?.name ?? "-"}</td>
                      <td className="px-4 py-3 font-semibold text-red-600">{item.overdueDays} 天</td>
                      <td className="px-4 py-3 text-slate-700">EUR {item.overdueAmount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-amber-700">EUR {item.penaltyAmount.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusMeta.cls}`}>
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{new Date(item.createdAt).toLocaleDateString()}</td>
                    </tr>
                  );
                })
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
