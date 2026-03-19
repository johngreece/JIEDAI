"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "进行中", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  COMPLETED: { label: "已完成", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  SUPERSEDED: { label: "已替代", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  DEFAULTED: { label: "违约", cls: "bg-red-50 text-red-700 border-red-200" },
};

const ITEM_STATUS: Record<string, string> = {
  PENDING: "待还",
  PAID: "已还",
  PARTIALLY_PAID: "部分还",
  OVERDUE: "逾期",
};

export default function RepaymentPlansPage() {
  const [items, setItems] = useState<PlanItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      const res = await fetch(`/api/repayment-plans?${params}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch { /* */ } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleSchedule(planId: string) {
    if (expandedId === planId) { setExpandedId(null); return; }
    setExpandedId(planId);
    setScheduleLoading(true);
    try {
      const res = await fetch(`/api/repayment-plans/${planId}/schedule`);
      const data = await res.json();
      setItems((prev) => prev.map((p) => p.id === planId ? { ...p, scheduleItems: data.items ?? [] } : p));
    } catch { /* */ } finally { setScheduleLoading(false); }
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <header className="panel-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">还款计划</h1>
          <p className="mt-1 text-sm text-slate-600">查看所有借款的分期还款计划</p>
        </div>
        <button onClick={load} className="btn-soft rounded-lg px-3 py-2 text-sm">刷新</button>
      </header>

      <section className="table-shell overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
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
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">加载中...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">暂无还款计划</td></tr>
              ) : items.map((p) => {
                const s = STATUS_MAP[p.status] ?? { label: p.status, cls: "bg-slate-50 text-slate-600 border-slate-200" };
                const isExpanded = expandedId === p.id;
                return (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{p.planNo}</td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/loan-applications/${p.applicationId}`} className="text-blue-600 hover:underline text-xs">
                        {p.application?.applicationNo ?? p.applicationId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">€{p.totalPrincipal.toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-700">€{p.totalInterest.toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-500">€{p.totalFee.toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-700">{p.totalPeriods} 期</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span></td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleSchedule(p.id)} className="text-blue-600 hover:underline text-sm">
                        {isExpanded ? "收起" : "明细"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 展开的还款明细 */}
        {expandedId && (() => {
          const plan = items.find((p) => p.id === expandedId);
          if (!plan) return null;
          return (
            <div className="border-t border-slate-200 bg-slate-50/50 p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">还款明细 — {plan.planNo}</h3>
              {scheduleLoading ? (
                <p className="text-sm text-slate-400">加载中...</p>
              ) : !plan.scheduleItems?.length ? (
                <p className="text-sm text-slate-400">暂无明细</p>
              ) : (
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="py-2 px-3">期数</th>
                      <th className="py-2 px-3">到期日</th>
                      <th className="py-2 px-3">本金</th>
                      <th className="py-2 px-3">利息</th>
                      <th className="py-2 px-3">费用</th>
                      <th className="py-2 px-3">应还</th>
                      <th className="py-2 px-3">剩余</th>
                      <th className="py-2 px-3">状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {plan.scheduleItems.map((si) => (
                      <tr key={si.id}>
                        <td className="py-2 px-3">{si.periodNumber}</td>
                        <td className="py-2 px-3">{new Date(si.dueDate).toLocaleDateString()}</td>
                        <td className="py-2 px-3">€{si.principal.toLocaleString()}</td>
                        <td className="py-2 px-3">€{si.interest.toLocaleString()}</td>
                        <td className="py-2 px-3">€{si.fee.toLocaleString()}</td>
                        <td className="py-2 px-3 font-medium">€{si.totalDue.toLocaleString()}</td>
                        <td className="py-2 px-3">{si.remaining > 0 ? `€${si.remaining.toLocaleString()}` : "-"}</td>
                        <td className="py-2 px-3">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${si.status === "PAID" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : si.status === "OVERDUE" ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                            {ITEM_STATUS[si.status] ?? si.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })()}

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
