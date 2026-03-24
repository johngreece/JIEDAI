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
  return "EUR " + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  useEffect(() => {
    void load();
  }, []);

  async function handleAction(id: string, action: "approve" | "reject") {
    setProcessing(true);
    try {
      const res = await fetch("/api/funder-withdrawals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withdrawalId: id, action, reason: rejectReason || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "操作失败");
        return;
      }
      setActionId(null);
      setRejectReason("");
      await load();
    } finally {
      setProcessing(false);
    }
  }

  const pending = items.filter((item) => item.status === "PENDING");
  const processed = items.filter((item) => item.status !== "PENDING");

  return (
    <div className="space-y-6">
      <header className="panel-soft admin-page-header">
        <div className="admin-page-header__meta">
          <span className="admin-page-header__eyebrow">Withdrawals</span>
          <h1 className="admin-page-header__title">提现审批</h1>
          <p className="admin-page-header__description">审批资金方提现申请，统一核对本息提取、申请时间与审批备注。</p>
        </div>
        <div className="admin-toolbar-group">
          <button onClick={load} className="admin-btn admin-btn-secondary">刷新</button>
        </div>
      </header>

      {loading ? <div className="py-8 text-center text-slate-400">加载中...</div> : null}

      {pending.length > 0 ? (
        <section className="space-y-3">
          <div className="admin-section-card__title text-amber-700">待审批 ({pending.length})</div>
          {pending.map((item) => (
            <div key={item.id} className="admin-section-card border-amber-200 bg-amber-50/50">
              <div className="admin-section-card__body">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="font-medium text-slate-900">{item.funderName}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5">{modeLabel[item.cooperationMode] ?? item.cooperationMode}</span>
                      <span>{typeLabel[item.type] ?? item.type}</span>
                      <span>·</span>
                      <span className="text-sm font-medium text-slate-800">{fmt(item.amount)}</span>
                      {item.interestAmount > 0 ? <span className="text-amber-600">利息 {fmt(item.interestAmount)}</span> : null}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">申请时间: {fmtDate(item.createdAt)}{item.remark ? ` · ${item.remark}` : ""}</div>
                  </div>
                  <div className="admin-btn-group">
                    {actionId === item.id ? (
                      <>
                        <input className="admin-field w-44 text-sm" placeholder="拒绝原因" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                        <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => handleAction(item.id, "reject")} disabled={processing}>拒绝</button>
                        <button className="text-sm text-slate-500 hover:underline" onClick={() => { setActionId(null); setRejectReason(""); }}>取消</button>
                      </>
                    ) : (
                      <>
                        <button className="admin-btn admin-btn-success admin-btn-sm" onClick={() => handleAction(item.id, "approve")} disabled={processing}>通过</button>
                        <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setActionId(item.id)}>拒绝</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="table-shell admin-table-shell">
        <div className="admin-table-toolbar">
          <div>
            <div className="admin-table-title">历史记录</div>
            <p className="admin-table-note">查看已处理的提现申请、审批时间和拒绝原因。</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
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
                processed.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{item.funderName}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{modeLabel[item.cooperationMode] ?? item.cooperationMode}</td>
                    <td className="px-4 py-3">{typeLabel[item.type] ?? item.type}</td>
                    <td className="px-4 py-3 font-medium">{fmt(item.amount)}</td>
                    <td className="px-4 py-3 text-amber-600">{fmt(item.interestAmount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadge[item.status] ?? ""}`}>{statusLabel[item.status] ?? item.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(item.createdAt)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(item.approvedAt)}</td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-xs text-slate-400">
                      {item.status === "REJECTED" ? <span className="text-red-500">{item.rejectedReason}</span> : (item.remark ?? "-")}
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
