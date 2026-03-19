"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type LoanItem = { id: string; applicationNo: string; amount: number; customer: { name: string }; product: { name: string } };
type FundAccount = { id: string; accountName: string; bankName: string; accountNo: string; balance: number; funder: { name: string } };
type Disbursement = {
  id: string;
  disbursementNo: string;
  status: string;
  amount: number;
  feeAmount: number;
  netAmount: number;
  createdAt: string;
  application: { id: string; applicationNo: string; customer: { name: string; phone: string } };
  fundAccount: { id: string; accountName: string; accountNo: string };
};

export default function DisbursementPage() {
  const [status, setStatus] = useState("ALL");
  const [list, setList] = useState<Disbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  const [approvedApps, setApprovedApps] = useState<LoanItem[]>([]);
  const [fundAccounts, setFundAccounts] = useState<FundAccount[]>([]);

  const [form, setForm] = useState({ applicationId: "", fundAccountId: "", amount: "", feeAmount: "0", remark: "" });
  const [creating, setCreating] = useState(false);

  async function loadList() {
    setLoading(true);
    setError("");
    try {
      const q = status === "ALL" ? "" : `?status=${encodeURIComponent(status)}`;
      const res = await fetch(`/api/disbursements${q}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "加载放款列表失败");
      setList(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载放款列表失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadOptions() {
    const [appRes, accRes] = await Promise.all([
      fetch("/api/loan-applications?status=APPROVED"),
      fetch("/api/fund-accounts"),
    ]);
    const appData = await appRes.json().catch(() => ({}));
    const accData = await accRes.json().catch(() => ({}));
    if (appRes.ok) setApprovedApps(appData.items ?? []);
    if (accRes.ok) setFundAccounts(accData.items ?? []);
  }

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    loadOptions();
  }, []);

  const stats = useMemo(() => ({
    total: list.length,
    pending: list.filter((x) => x.status === "PENDING").length,
    paid: list.filter((x) => x.status === "PAID").length,
  }), [list]);

  async function createDisbursement(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/disbursements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: form.applicationId,
          fundAccountId: form.fundAccountId,
          amount: Number(form.amount),
          feeAmount: Number(form.feeAmount || "0"),
          remark: form.remark || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "创建放款单失败");
      setForm({ applicationId: "", fundAccountId: "", amount: "", feeAmount: "0", remark: "" });
      await Promise.all([loadList(), loadOptions()]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "创建放款单失败");
    } finally {
      setCreating(false);
    }
  }

  async function confirmPaid(id: string) {
    setActing(id);
    try {
      const res = await fetch(`/api/disbursements/${id}/confirm-paid`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "确认打款失败");
      await Promise.all([loadList(), loadOptions()]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "确认打款失败");
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="panel-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">放款管理</h1>
          <p className="mt-1 text-sm text-slate-600">待放款队列、确认打款、联动还款计划</p>
        </div>
        <button onClick={loadList} className="btn-soft rounded-lg px-3 py-2 text-sm">刷新</button>
      </header>

      <section className="grid grid-cols-3 gap-3">
        <div className="stat-tile rounded-xl p-4"><p className="text-xs text-slate-500">总放款单</p><p className="text-xl font-semibold">{stats.total}</p></div>
        <div className="stat-tile rounded-xl p-4"><p className="text-xs text-slate-500">待放款</p><p className="text-xl font-semibold">{stats.pending}</p></div>
        <div className="stat-tile rounded-xl p-4"><p className="text-xs text-slate-500">已打款</p><p className="text-xl font-semibold">{stats.paid}</p></div>
      </section>

      <section className="panel-soft rounded-xl p-4">
        <h2 className="font-semibold text-slate-900 mb-3">创建放款单</h2>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={createDisbursement}>
          <label className="space-y-1 text-sm">
            <span className="text-slate-500">审批通过申请</span>
            <select required value={form.applicationId} onChange={(e) => {
              const app = approvedApps.find((x) => x.id === e.target.value);
              setForm((f) => ({ ...f, applicationId: e.target.value, amount: app ? String(app.amount) : f.amount }));
            }} className="input-base">
              <option value="">请选择申请</option>
              {approvedApps.map((x) => <option key={x.id} value={x.id}>{x.applicationNo} · {x.customer.name} · €{x.amount.toFixed(2)}</option>)}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-500">资金账户</span>
            <select required value={form.fundAccountId} onChange={(e) => setForm((f) => ({ ...f, fundAccountId: e.target.value }))} className="input-base">
              <option value="">请选择账户</option>
              {fundAccounts.map((x) => <option key={x.id} value={x.id}>{x.funder.name} · {x.accountName} · 余额€{x.balance.toFixed(2)}</option>)}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-500">放款金额</span>
            <input required type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="input-base" />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-500">手续费</span>
            <input required type="number" step="0.01" value={form.feeAmount} onChange={(e) => setForm((f) => ({ ...f, feeAmount: e.target.value }))} className="input-base" />
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="text-slate-500">备注</span>
            <input value={form.remark} onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))} className="input-base" />
          </label>

          <div className="md:col-span-2">
            <button disabled={creating} className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-50">
              {creating ? "创建中..." : "创建放款单"}
            </button>
          </div>
        </form>
      </section>

      <section className="table-shell overflow-hidden rounded-xl">
        <div className="border-b border-slate-100 px-4 py-3 flex gap-2">
          <button onClick={() => setStatus("ALL")} className={`px-3 py-1.5 text-sm rounded-full border ${status === "ALL" ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200"}`}>全部</button>
          <button onClick={() => setStatus("PENDING")} className={`px-3 py-1.5 text-sm rounded-full border ${status === "PENDING" ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200"}`}>待放款</button>
          <button onClick={() => setStatus("PAID")} className={`px-3 py-1.5 text-sm rounded-full border ${status === "PAID" ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200"}`}>已打款</button>
        </div>

        {error ? <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border-t border-red-100">{error}</div> : null}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3">放款单号</th>
                <th className="text-left px-4 py-3">申请/客户</th>
                <th className="text-left px-4 py-3">金额</th>
                <th className="text-left px-4 py-3">账户</th>
                <th className="text-left px-4 py-3">状态</th>
                <th className="text-left px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="px-4 py-6 text-slate-500">加载中...</td></tr> : null}
              {!loading && list.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-slate-500">暂无放款单</td></tr> : null}
              {!loading && list.map((x) => (
                <tr key={x.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-800">{x.disbursementNo}</td>
                  <td className="px-4 py-3">{x.application.applicationNo}<div className="text-xs text-slate-500">{x.application.customer.name} · {x.application.customer.phone}</div></td>
                  <td className="px-4 py-3">€{x.amount.toFixed(2)}<div className="text-xs text-slate-500">净额 €{x.netAmount.toFixed(2)}</div></td>
                  <td className="px-4 py-3">{x.fundAccount.accountName}<div className="text-xs text-slate-500">{x.fundAccount.accountNo}</div></td>
                  <td className="px-4 py-3">{x.status}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 items-center">
                      <Link href={`/admin/disbursements/${x.id}`} className="text-blue-600 hover:underline">详情</Link>
                      {x.status === "PENDING" ? (
                        <button disabled={acting === x.id} onClick={() => confirmPaid(x.id)} className="text-emerald-700 hover:underline disabled:opacity-50">
                          {acting === x.id ? "处理中..." : "确认打款"}
                        </button>
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
