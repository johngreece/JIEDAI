"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Item = {
  id: string;
  applicationNo: string;
  status: string;
  amount: number;
  termValue: number;
  termUnit: string;
  createdAt: string;
  customer: { id: string; name: string; phone: string };
  product: { id: string; name: string };
};

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

export default function LoanApplicationsPage() {
  const [status, setStatus] = useState("ALL");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);

  async function load() {
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
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const stats = useMemo(() => {
    return {
      total: items.length,
      pending: items.filter((x) => x.status === "PENDING_RISK" || x.status === "PENDING_APPROVAL").length,
      approved: items.filter((x) => x.status === "APPROVED").length,
      rejected: items.filter((x) => x.status === "REJECTED").length,
    };
  }, [items]);

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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">借款申请</h1>
          <p className="text-sm text-slate-500 mt-1">管理申请流转、风控与审批动作</p>
        </div>
        <button onClick={load} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50">刷新</button>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">总数</p><p className="text-xl font-semibold">{stats.total}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">待处理</p><p className="text-xl font-semibold">{stats.pending}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">已审批</p><p className="text-xl font-semibold">{stats.approved}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">已拒绝</p><p className="text-xl font-semibold">{stats.rejected}</p></div>
      </section>

      <section className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 text-sm rounded-full border ${status === s ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`}
            >
              {s === "ALL" ? "全部" : statusText(s)}
            </button>
          ))}
        </div>
      </section>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <section className="rounded-xl border bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3">申请单号</th>
                <th className="text-left px-4 py-3">客户</th>
                <th className="text-left px-4 py-3">产品</th>
                <th className="text-left px-4 py-3">金额</th>
                <th className="text-left px-4 py-3">状态</th>
                <th className="text-left px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-4 py-6 text-slate-500" colSpan={6}>加载中...</td></tr>
              ) : items.length === 0 ? (
                <tr><td className="px-4 py-6 text-slate-500" colSpan={6}>暂无数据</td></tr>
              ) : items.map((x) => (
                <tr key={x.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-800">{x.applicationNo}</td>
                  <td className="px-4 py-3">{x.customer.name}<div className="text-xs text-slate-500">{x.customer.phone}</div></td>
                  <td className="px-4 py-3">{x.product.name}</td>
                  <td className="px-4 py-3">¥ {x.amount.toFixed(2)}</td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${statusCls(x.status)}`}>{statusText(x.status)}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link className="text-blue-600 hover:underline" href={`/admin/loan-applications/${x.id}`}>详情</Link>
                      {x.status === "DRAFT" || x.status === "REJECTED" ? (
                        <button disabled={actingId === x.id} onClick={() => action(x.id, "submit")} className="text-slate-700 hover:underline">提交</button>
                      ) : null}
                      {x.status === "PENDING_RISK" ? (
                        <>
                          <button disabled={actingId === x.id} onClick={() => action(x.id, "risk-pass")} className="text-emerald-700 hover:underline">风控通过</button>
                          <button disabled={actingId === x.id} onClick={() => action(x.id, "risk-reject")} className="text-red-700 hover:underline">风控拒绝</button>
                        </>
                      ) : null}
                      {x.status === "PENDING_APPROVAL" ? (
                        <>
                          <button disabled={actingId === x.id} onClick={() => action(x.id, "approve")} className="text-emerald-700 hover:underline">审批通过</button>
                          <button disabled={actingId === x.id} onClick={() => action(x.id, "reject")} className="text-red-700 hover:underline">审批拒绝</button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
