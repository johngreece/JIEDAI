"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { LoanApplicationListItem } from "@/lib/admin-prefetch";

const STATUS_OPTIONS = ["ALL", "DRAFT", "REJECTED", "PENDING_RISK", "PENDING_APPROVAL", "APPROVED", "DISBURSED"];

function statusText(status: string) {
  const map: Record<string, string> = {
    DRAFT: "草稿",
    REJECTED: "已拒绝",
    PENDING_RISK: "待风控",
    PENDING_APPROVAL: "待审批",
    APPROVED: "已审批",
    DISBURSED: "已放款",
    CONTRACTED: "已签约",
  };
  return map[status] ?? status;
}

function statusCls(status: string) {
  if (status === "APPROVED" || status === "DISBURSED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "PENDING_RISK" || status === "PENDING_APPROVAL") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "REJECTED") return "bg-red-50 text-red-700 border-red-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

type LoanApplicationsPageClientProps = {
  initialItems: LoanApplicationListItem[];
  initialStatus?: string;
};

export function LoanApplicationsPageClient({
  initialItems,
  initialStatus = "ALL",
}: LoanApplicationsPageClientProps) {
  const [status, setStatus] = useState(initialStatus);
  const [items, setItems] = useState<LoanApplicationListItem[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const didMountRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = status === "ALL" ? "" : `?status=${encodeURIComponent(status)}`;
      const res = await fetch(`/api/loan-applications${q}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "加载失败");
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    void load();
  }, [load]);

  const stats = useMemo(
    () => ({
      total: items.length,
      pending: items.filter((item) => item.status === "PENDING_RISK" || item.status === "PENDING_APPROVAL").length,
      approved: items.filter((item) => item.status === "APPROVED").length,
      rejected: items.filter((item) => item.status === "REJECTED").length,
    }),
    [items],
  );

  async function action(id: string, type: "submit" | "risk-pass" | "risk-reject" | "approve" | "reject") {
    setActingId(id);
    try {
      let url = "";
      let payload: Record<string, unknown> = {};

      if (type === "submit") url = `/api/loan-applications/${id}/submit`;
      if (type === "risk-pass") {
        url = `/api/loan-applications/${id}/risk`;
        payload = { action: "PASS", comment: "系统快速通过" };
      }
      if (type === "risk-reject") {
        url = `/api/loan-applications/${id}/risk`;
        payload = { action: "REJECT", comment: "资料不完整" };
      }
      if (type === "approve") {
        url = `/api/loan-applications/${id}/approve`;
        payload = { action: "APPROVE" };
      }
      if (type === "reject") {
        url = `/api/loan-applications/${id}/approve`;
        payload = { action: "REJECT", comment: "审批拒绝" };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: Object.keys(payload).length ? JSON.stringify(payload) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "操作失败");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "操作失败");
    } finally {
      setActingId(null);
    }
  }

  async function removeApplication(item: LoanApplicationListItem) {
    if (!window.confirm(`确认删除借款申请“${item.applicationNo}”吗？`)) return;
    setError("");
    try {
      const res = await fetch(`/api/loan-applications/${item.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "删除失败");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "删除失败");
    }
  }

  return (
    <div className="space-y-6">
      <header className="panel-soft admin-page-header">
        <div className="admin-page-header__meta">
          <span className="admin-page-header__eyebrow">Application Flow</span>
          <h1 className="admin-page-header__title">借款申请</h1>
          <p className="admin-page-header__description">
            集中处理借款申请流转、风控审核、审批动作和放款前状态追踪，首屏直接出数据。
          </p>
        </div>
        <div className="admin-toolbar-group">
          <button onClick={() => void load()} className="admin-btn admin-btn-secondary">
            刷新列表
          </button>
        </div>
      </header>

      <section className="admin-stat-grid">
        <div className="stat-tile admin-stat-card">
          <p className="admin-stat-card__label">总申请数</p>
          <p className="admin-stat-card__value">{stats.total}</p>
        </div>
        <div className="stat-tile admin-stat-card">
          <p className="admin-stat-card__label">待处理</p>
          <p className="admin-stat-card__value text-amber-600">{stats.pending}</p>
        </div>
        <div className="stat-tile admin-stat-card">
          <p className="admin-stat-card__label">已审批</p>
          <p className="admin-stat-card__value text-emerald-600">{stats.approved}</p>
        </div>
        <div className="stat-tile admin-stat-card">
          <p className="admin-stat-card__label">已拒绝</p>
          <p className="admin-stat-card__value text-rose-600">{stats.rejected}</p>
        </div>
      </section>

      <section className="panel-soft admin-toolbar">
        <div>
          <div className="admin-table-title">状态筛选</div>
          <p className="admin-table-note">切换不同阶段，快速处理待审与异常申请。</p>
        </div>
        <div className="admin-filter-tabs">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option}
              onClick={() => setStatus(option)}
              className={`admin-filter-chip ${status === option ? "is-active" : ""}`}
            >
              {option === "ALL" ? "全部" : statusText(option)}
            </button>
          ))}
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="table-shell admin-table-shell">
        <div className="admin-table-toolbar">
          <div>
            <div className="admin-table-title">申请列表</div>
            <p className="admin-table-note">支持直接进入详情页，或在列表页完成快速流转。</p>
          </div>
          <div className="text-xs font-medium text-slate-500">
            当前筛选 {status === "ALL" ? "全部" : statusText(status)}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3">申请单号</th>
                <th className="px-4 py-3">客户</th>
                <th className="px-4 py-3">产品</th>
                <th className="px-4 py-3">金额</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td className="px-4 py-10 text-center text-slate-400" colSpan={6}>
                    加载中...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-slate-400" colSpan={6}>
                    暂无数据
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-medium text-slate-800">{item.applicationNo}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{item.customer.name}</div>
                      <div className="text-xs text-slate-500">{item.customer.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{item.product.name}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">EUR {item.amount.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusCls(item.status)}`}>
                        {statusText(item.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="admin-btn-group">
                        <Link href={`/admin/loan-applications/${item.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                          详情
                        </Link>
                        {(item.status === "DRAFT" || item.status === "REJECTED") ? (
                          <button
                            disabled={actingId === item.id}
                            onClick={() => action(item.id, "submit")}
                            className="text-sm font-medium text-slate-700 hover:underline disabled:opacity-50"
                          >
                            提交
                          </button>
                        ) : null}
                        {item.status === "PENDING_RISK" ? (
                          <>
                            <button
                              disabled={actingId === item.id}
                              onClick={() => action(item.id, "risk-pass")}
                              className="text-sm font-medium text-emerald-700 hover:underline disabled:opacity-50"
                            >
                              风控通过
                            </button>
                            <button
                              disabled={actingId === item.id}
                              onClick={() => action(item.id, "risk-reject")}
                              className="text-sm font-medium text-red-700 hover:underline disabled:opacity-50"
                            >
                              风控拒绝
                            </button>
                          </>
                        ) : null}
                        {item.status === "PENDING_APPROVAL" ? (
                          <>
                            <button
                              disabled={actingId === item.id}
                              onClick={() => action(item.id, "approve")}
                              className="text-sm font-medium text-emerald-700 hover:underline disabled:opacity-50"
                            >
                              审批通过
                            </button>
                            <button
                              disabled={actingId === item.id}
                              onClick={() => action(item.id, "reject")}
                              className="text-sm font-medium text-red-700 hover:underline disabled:opacity-50"
                            >
                              审批拒绝
                            </button>
                          </>
                        ) : null}
                        {!["DISBURSED", "CONTRACTED"].includes(item.status) ? (
                          <button
                            type="button"
                            onClick={() => void removeApplication(item)}
                            className="text-sm font-medium text-red-600 hover:underline"
                          >
                            删除
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
