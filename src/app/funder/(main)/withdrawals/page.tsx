"use client";

import { useEffect, useState } from "react";

interface Withdrawal {
  id: string;
  amount: number;
  type: string;
  status: string;
  includeInterest: boolean;
  interestAmount: number;
  remark: string | null;
  createdAt: string;
  approvedAt: string | null;
  rejectedReason: string | null;
}

const typeLabel: Record<string, string> = {
  PRINCIPAL: "提取本金",
  INTEREST: "提取利息",
  PRINCIPAL_AND_INTEREST: "本息一起",
};
const statusLabel: Record<string, string> = {
  PENDING: "待审批",
  APPROVED: "已通过",
  REJECTED: "已拒绝",
};
const statusBadge: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
};

function fmt(n: number) {
  return "€" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function FunderWithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [withdrawableInterest, setWithdrawableInterest] = useState(0);
  const [withdrawablePrincipal, setWithdrawablePrincipal] = useState(0);
  const [loading, setLoading] = useState(true);

  // 提现表单
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "INTEREST", amount: "", remark: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadData = () => {
    fetch("/api/funder/withdrawals")
      .then((r) => r.json())
      .then((d) => {
        setWithdrawals(d.withdrawals ?? []);
        setWithdrawableInterest(d.withdrawableInterest ?? 0);
        setWithdrawablePrincipal(d.withdrawablePrincipal ?? 0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const maxAmount =
    form.type === "INTEREST"
      ? withdrawableInterest
      : form.type === "PRINCIPAL"
      ? withdrawablePrincipal
      : withdrawableInterest + withdrawablePrincipal;

  const handleSubmit = async () => {
    setError("");
    const amount = Number(form.amount);
    if (!amount || amount <= 0) { setError("请输入有效金额"); return; }
    if (amount > maxAmount) { setError(`最大可提 ${fmt(maxAmount)}`); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/funder/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          amount,
          includeInterest: form.type !== "PRINCIPAL",
          remark: form.remark || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "提交失败");
        return;
      }
      setShowForm(false);
      setForm({ type: "INTEREST", amount: "", remark: "" });
      loadData();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-slate-900">提现管理</h1>
        <button
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-700"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "取消" : "发起提现"}
        </button>
      </div>

      {/* 可提现概览 */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">可提本金</div>
          <div className="mt-1 text-xl font-bold text-slate-900">{fmt(withdrawablePrincipal)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">可提利息</div>
          <div className="mt-1 text-xl font-bold text-amber-600">{fmt(withdrawableInterest)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">合计可提</div>
          <div className="mt-1 text-xl font-bold text-emerald-600">{fmt(withdrawableInterest + withdrawablePrincipal)}</div>
        </div>
      </div>

      {/* 提现表单 */}
      {showForm && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 space-y-4">
          <h3 className="font-semibold text-slate-800">新建提现申请</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-slate-600">提现类型</label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value, amount: "" })}
              >
                <option value="INTEREST">仅提利息</option>
                <option value="PRINCIPAL">仅提本金</option>
                <option value="PRINCIPAL_AND_INTEREST">本息一起</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">
                金额（最多 {fmt(maxAmount)}）
              </label>
              <input
                type="number"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">备注</label>
              <input
                type="text"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="选填"
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
              />
            </div>
          </div>
          {form.type === "PRINCIPAL" && (
            <p className="text-xs text-amber-600">注意：提前取回本金将不计算利息</p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "提交中..." : "提交申请"}
          </button>
        </div>
      )}

      {/* 提现历史 */}
      {withdrawals.length === 0 ? (
        <p className="py-12 text-center text-slate-400">暂无提现记录</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-3">申请时间</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">申请金额</th>
                <th className="px-4 py-3">利息部分</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">审批时间</th>
                <th className="px-4 py-3">备注</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((w) => (
                <tr key={w.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-slate-500">{fmtDate(w.createdAt)}</td>
                  <td className="px-4 py-3">{typeLabel[w.type] ?? w.type}</td>
                  <td className="px-4 py-3 font-medium">{fmt(w.amount)}</td>
                  <td className="px-4 py-3 text-amber-600">{fmt(w.interestAmount)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadge[w.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {statusLabel[w.status] ?? w.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(w.approvedAt)}</td>
                  <td className="px-4 py-3 text-slate-400 max-w-[200px] truncate">
                    {w.status === "REJECTED" && w.rejectedReason ? (
                      <span className="text-red-500">{w.rejectedReason}</span>
                    ) : (
                      w.remark ?? "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
