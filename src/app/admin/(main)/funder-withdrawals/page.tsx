"use client";

import { useEffect, useState } from "react";

interface Withdrawal {
  id: string;
  funderId: string;
  funderName: string;
  cooperationMode: string;
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
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
};
const modeLabel: Record<string, string> = {
  FIXED_MONTHLY: "固定月息",
  VOLUME_BASED: "业务量",
};

function fmt(n: number) {
  return "€" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function FunderWithdrawalsPage() {
  const [items, setItems] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [processing, setProcessing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/funder-withdrawals");
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAction(id: string, action: "approve" | "reject") {
    setProcessing(true);
    try {
      const res = await fetch("/api/funder-withdrawals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withdrawalId: id, action, reason: rejectReason || undefined }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || "操作失败");
        return;
      }
      setActionId(null);
      setRejectReason("");
      load();
    } finally {
      setProcessing(false);
    }
  }

  const pending = items.filter((w) => w.status === "PENDING");
  const processed = items.filter((w) => w.status !== "PENDING");

  return (
    <div className="space-y-6">
      <header className="panel-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">提现审批</h1>
          <p className="mt-1 text-sm text-slate-600">审批资金方的提现申请</p>
        </div>
        <button onClick={load} className="btn-soft rounded-lg px-3 py-2 text-sm">刷新</button>
      </header>

      {loading && <div className="py-8 text-center text-slate-400">加载中...</div>}

      {/* Pending */}
      {pending.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-amber-700">待审批 ({pending.length})</h2>
          <div className="space-y-3">
            {pending.map((w) => (
              <div key={w.id} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-900">{w.funderName}</div>
                    <div className="flex flex-wrap gap-2 mt-1 text-xs text-slate-500">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5">{modeLabel[w.cooperationMode] ?? w.cooperationMode}</span>
                      <span>{typeLabel[w.type] ?? w.type}</span>
                      <span>·</span>
                      <span className="font-medium text-slate-800 text-sm">{fmt(w.amount)}</span>
                      {w.interestAmount > 0 && <span className="text-amber-600">（利息 {fmt(w.interestAmount)}）</span>}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">申请时间：{fmtDate(w.createdAt)}{w.remark ? ` · ${w.remark}` : ""}</div>
                  </div>
                  <div className="flex gap-2">
                    {actionId === w.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          className="w-40 rounded border border-slate-300 px-2 py-1 text-sm"
                          placeholder="拒绝原因"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                        />
                        <button
                          className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                          onClick={() => handleAction(w.id, "reject")}
                          disabled={processing}
                        >拒绝</button>
                        <button className="text-sm text-slate-500 hover:underline" onClick={() => { setActionId(null); setRejectReason(""); }}>取消</button>
                      </div>
                    ) : (
                      <>
                        <button
                          className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                          onClick={() => handleAction(w.id, "approve")}
                          disabled={processing}
                        >通过</button>
                        <button
                          className="rounded border border-red-300 bg-white px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                          onClick={() => setActionId(w.id)}
                        >拒绝</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Processed */}
      <section className="table-shell overflow-hidden rounded-xl">
        <h2 className="px-4 py-3 text-base font-semibold text-slate-800">历史记录</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-3">资金方</th>
                <th className="px-4 py-3">模式</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">金额</th>
                <th className="px-4 py-3">利息</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">申请时间</th>
                <th className="px-4 py-3">审批时间</th>
                <th className="px-4 py-3">备注</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {processed.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">暂无历史记录</td></tr>
              ) : (
                processed.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-900">{w.funderName}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{modeLabel[w.cooperationMode] ?? w.cooperationMode}</td>
                    <td className="px-4 py-3">{typeLabel[w.type] ?? w.type}</td>
                    <td className="px-4 py-3 font-medium">{fmt(w.amount)}</td>
                    <td className="px-4 py-3 text-amber-600">{fmt(w.interestAmount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadge[w.status] ?? ""}`}>
                        {statusLabel[w.status] ?? w.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(w.createdAt)}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(w.approvedAt)}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-[160px] truncate">
                      {w.status === "REJECTED" ? <span className="text-red-500">{w.rejectedReason}</span> : (w.remark ?? "-")}
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
