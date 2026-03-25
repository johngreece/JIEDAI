"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ScheduleRow = {
  id: string;
  periodNumber: number;
  dueDate: string;
  principal: number;
  interest: number;
  fee: number;
  totalDue: number;
  remaining: number;
  status: string;
};

type PlanItem = {
  id: string;
  planNo: string;
  applicationId: string;
  totalPrincipal: number;
  totalInterest: number;
  totalFee: number;
  totalPeriods: number;
  status: string;
  version: number;
  createdAt: string;
  application?: { applicationNo: string; customer?: { name: string } };
  scheduleItems?: ScheduleRow[];
};

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "进行中", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  COMPLETED: { label: "已完成", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  SUPERSEDED: { label: "已替代", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  DEFAULTED: { label: "违约", cls: "bg-red-50 text-red-700 border-red-200" },
};

const ITEM_STATUS: Record<string, string> = {
  PENDING: "待还",
  PAID: "已还",
  PARTIALLY_PAID: "部分已还",
  OVERDUE: "逾期",
};

export default function RepaymentPlansPage() {
  const [items, setItems] = useState<PlanItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      const res = await fetch(`/api/repayment-plans?${params}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleSchedule(planId: string) {
    if (expandedId === planId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(planId);
    setScheduleLoading(true);
    try {
      const res = await fetch(`/api/repayment-plans/${planId}/schedule`);
      const data = await res.json();
      setItems((prev) => prev.map((plan) => (plan.id === planId ? { ...plan, scheduleItems: data.items ?? [] } : plan)));
    } finally {
      setScheduleLoading(false);
    }
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <header className="panel-soft admin-page-header">
        <div className="admin-page-header__meta">
          <span className="admin-page-header__eyebrow">Repayment Plans</span>
          <h1 className="admin-page-header__title">还款计划</h1>
          <p className="admin-page-header__description">查看借款分期结构、剩余应还、逾期状态与明细计划。</p>
        </div>
        <div className="admin-toolbar-group">
          <button onClick={load} className="admin-btn admin-btn-secondary">
            刷新
          </button>
        </div>
      </header>

      <section className="table-shell admin-table-shell">
        <div className="admin-table-toolbar">
          <div>
            <div className="admin-table-title">计划列表</div>
            <p className="admin-table-note">支持展开分期明细，快速核对每期本金、利息、费用与剩余金额。</p>
          </div>
          <div className="text-xs font-medium text-slate-500">每页 20 条</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3">计划编号</th>
                <th className="px-4 py-3">关联申请</th>
                <th className="px-4 py-3">本金</th>
                <th className="px-4 py-3">利息</th>
                <th className="px-4 py-3">费用</th>
                <th className="px-4 py-3">期数</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    加载中...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    暂无还款计划
                  </td>
                </tr>
              ) : (
                items.map((plan) => {
                  const statusMeta = STATUS_MAP[plan.status] ?? {
                    label: plan.status,
                    cls: "bg-slate-50 text-slate-600 border-slate-200",
                  };
                  const isExpanded = expandedId === plan.id;

                  return (
                    <tr key={plan.id}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{plan.planNo}</td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/loan-applications/${plan.applicationId}`} className="text-xs font-medium text-blue-600 hover:underline">
                          {plan.application?.applicationNo ?? plan.applicationId.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-700">EUR {plan.totalPrincipal.toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-700">EUR {plan.totalInterest.toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-500">EUR {plan.totalFee.toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-700">{plan.totalPeriods} 期</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusMeta.cls}`}>
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleSchedule(plan.id)} className="text-sm font-medium text-blue-600 hover:underline">
                          {isExpanded ? "收起" : "查看明细"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {expandedId ? (
          <div className="border-t border-slate-200 bg-slate-50/70 p-4">
            {(() => {
              const plan = items.find((item) => item.id === expandedId);
              if (!plan) return null;

              return (
                <>
                  <h3 className="text-sm font-semibold text-slate-800">分期明细: {plan.planNo}</h3>
                  {scheduleLoading ? (
                    <p className="mt-3 text-sm text-slate-400">加载中...</p>
                  ) : !plan.scheduleItems?.length ? (
                    <p className="mt-3 text-sm text-slate-400">暂无明细</p>
                  ) : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-slate-500">
                            <th className="px-3 py-2">期数</th>
                            <th className="px-3 py-2">到期日</th>
                            <th className="px-3 py-2">本金</th>
                            <th className="px-3 py-2">利息</th>
                            <th className="px-3 py-2">费用</th>
                            <th className="px-3 py-2">应还</th>
                            <th className="px-3 py-2">剩余</th>
                            <th className="px-3 py-2">状态</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {plan.scheduleItems.map((item) => (
                            <tr key={item.id}>
                              <td className="px-3 py-2">{item.periodNumber}</td>
                              <td className="px-3 py-2">{new Date(item.dueDate).toLocaleDateString()}</td>
                              <td className="px-3 py-2">EUR {item.principal.toLocaleString()}</td>
                              <td className="px-3 py-2">EUR {item.interest.toLocaleString()}</td>
                              <td className="px-3 py-2">EUR {item.fee.toLocaleString()}</td>
                              <td className="px-3 py-2 font-medium">EUR {item.totalDue.toLocaleString()}</td>
                              <td className="px-3 py-2">{item.remaining > 0 ? `EUR ${item.remaining.toLocaleString()}` : "-"}</td>
                              <td className="px-3 py-2">
                                <span
                                  className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${
                                    item.status === "PAID"
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                      : item.status === "OVERDUE"
                                        ? "border-red-200 bg-red-50 text-red-700"
                                        : "border-amber-200 bg-amber-50 text-amber-700"
                                  }`}
                                >
                                  {ITEM_STATUS[item.status] ?? item.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        ) : null}

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
