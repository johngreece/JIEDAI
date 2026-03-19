"use client";

import { useEffect, useState } from "react";

interface Disbursement {
  id: string;
  disbursementNo: string;
  amount: number;
  netAmount: number;
  feeAmount: number;
  status: string;
  disbursedAt: string | null;
  customerName: string;
}

const statusLabel: Record<string, string> = {
  PENDING: "待处理",
  PAID: "已打款",
  CONFIRMED: "已确认",
  CANCELLED: "已取消",
};
const statusBadge: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  PAID: "bg-blue-100 text-blue-700",
  CONFIRMED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
};

function fmt(n: number) {
  return "€" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function FunderDisbursementsPage() {
  const [list, setList] = useState<Disbursement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/funder/dashboard")
      .then((r) => r.json())
      .then((d) => setList(d.recentDisbursements ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">放款明细</h1>

      {list.length === 0 ? (
        <p className="py-12 text-center text-slate-400">暂无放款记录</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-3">放款编号</th>
                <th className="px-4 py-3">客户</th>
                <th className="px-4 py-3">放款金额</th>
                <th className="px-4 py-3">手续费</th>
                <th className="px-4 py-3">实际到手</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">放款日期</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-mono text-xs">{d.disbursementNo}</td>
                  <td className="px-4 py-3">{d.customerName}</td>
                  <td className="px-4 py-3 font-medium">{fmt(d.amount)}</td>
                  <td className="px-4 py-3 text-red-500">{fmt(d.feeAmount)}</td>
                  <td className="px-4 py-3 font-medium text-emerald-600">{fmt(d.netAmount)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadge[d.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {statusLabel[d.status] ?? d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(d.disbursedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-slate-400">
        共 {list.length} 条记录 · 总放款 {fmt(list.reduce((s, d) => s + d.amount, 0))} · 实际出资 {fmt(list.reduce((s, d) => s + d.netAmount, 0))}
      </div>
    </div>
  );
}
