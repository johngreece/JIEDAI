"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Detail = {
  id: string;
  disbursementNo: string;
  status: string;
  amount: number;
  feeAmount: number;
  netAmount: number;
  disbursedAt: string | null;
  remark: string | null;
  application: {
    id: string;
    applicationNo: string;
    status: string;
    customer: { id: string; name: string; phone: string };
    product: { id: string; name: string };
  };
  fundAccount: {
    id: string;
    accountName: string;
    bankName: string;
    accountNo: string;
    balance: number;
    funder: { id: string; name: string };
  };
  repaymentPlan: null | {
    id: string;
    planNo: string;
    totalPrincipal: number;
    totalInterest: number;
    totalFee: number;
    totalPeriods: number;
    status: string;
    items: Array<{
      id: string;
      periodNumber: number;
      dueDate: string;
      principal: number;
      interest: number;
      fee: number;
      totalDue: number;
      remaining: number;
      status: string;
    }>;
  };
};

export default function DisbursementDetailPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/disbursements/${params.id}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "加载失败");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function confirmPaid() {
    setActing(true);
    try {
      const res = await fetch(`/api/disbursements/${params.id}/confirm-paid`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "确认打款失败");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "确认打款失败");
    } finally {
      setActing(false);
    }
  }

  if (loading) return <div className="p-4">加载中...</div>;
  if (error || !data) return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error || "数据不存在"}</div>;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-slate-500">放款单详情</div>
          <h1 className="text-2xl font-bold text-slate-900">{data.disbursementNo}</h1>
          <p className="text-sm text-slate-500 mt-1">状态：{data.status}</p>
        </div>
        <div className="flex gap-2">
          {data.status === "PENDING" ? (
            <button disabled={acting} onClick={confirmPaid} className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm hover:bg-emerald-700 disabled:opacity-50">
              {acting ? "处理中..." : "确认打款"}
            </button>
          ) : null}
          <Link href="/admin/disbursements" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50">返回列表</Link>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">放款金额</p><p className="text-2xl font-bold">¥ {data.amount.toFixed(2)}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">手续费</p><p className="text-2xl font-bold">¥ {data.feeAmount.toFixed(2)}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">净到账</p><p className="text-2xl font-bold text-emerald-700">¥ {data.netAmount.toFixed(2)}</p></div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-4 space-y-2">
          <h2 className="font-semibold">申请信息</h2>
          <p className="text-sm">申请单：{data.application.applicationNo}</p>
          <p className="text-sm">客户：{data.application.customer.name}（{data.application.customer.phone}）</p>
          <p className="text-sm">产品：{data.application.product.name}</p>
          <p className="text-sm">申请状态：{data.application.status}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 space-y-2">
          <h2 className="font-semibold">资金账户</h2>
          <p className="text-sm">资金方：{data.fundAccount.funder.name}</p>
          <p className="text-sm">账户：{data.fundAccount.accountName}</p>
          <p className="text-sm">账号：{data.fundAccount.accountNo}</p>
          <p className="text-sm">当前余额：¥ {data.fundAccount.balance.toFixed(2)}</p>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="font-semibold mb-3">还款计划可视化</h2>
        {!data.repaymentPlan ? (
          <p className="text-sm text-slate-500">尚未生成还款计划（确认打款后自动生成）</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="rounded-lg border bg-slate-50 p-3"><p className="text-xs text-slate-500">计划编号</p><p className="text-sm font-medium">{data.repaymentPlan.planNo}</p></div>
              <div className="rounded-lg border bg-slate-50 p-3"><p className="text-xs text-slate-500">期数</p><p className="text-sm font-medium">{data.repaymentPlan.totalPeriods}</p></div>
              <div className="rounded-lg border bg-slate-50 p-3"><p className="text-xs text-slate-500">本金</p><p className="text-sm font-medium">¥ {data.repaymentPlan.totalPrincipal.toFixed(2)}</p></div>
              <div className="rounded-lg border bg-slate-50 p-3"><p className="text-xs text-slate-500">利息</p><p className="text-sm font-medium">¥ {data.repaymentPlan.totalInterest.toFixed(2)}</p></div>
              <div className="rounded-lg border bg-slate-50 p-3"><p className="text-xs text-slate-500">费用</p><p className="text-sm font-medium">¥ {data.repaymentPlan.totalFee.toFixed(2)}</p></div>
            </div>

            <div className="overflow-x-auto border rounded-lg">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left px-3 py-2">期次</th>
                    <th className="text-left px-3 py-2">到期日</th>
                    <th className="text-left px-3 py-2">本金</th>
                    <th className="text-left px-3 py-2">利息</th>
                    <th className="text-left px-3 py-2">费用</th>
                    <th className="text-left px-3 py-2">应还</th>
                    <th className="text-left px-3 py-2">剩余</th>
                    <th className="text-left px-3 py-2">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {data.repaymentPlan.items.length === 0 ? (
                    <tr><td colSpan={8} className="px-3 py-4 text-slate-500">计划已生成，但尚无期次明细</td></tr>
                  ) : data.repaymentPlan.items.map((x) => (
                    <tr key={x.id} className="border-t">
                      <td className="px-3 py-2">第 {x.periodNumber} 期</td>
                      <td className="px-3 py-2">{new Date(x.dueDate).toLocaleDateString()}</td>
                      <td className="px-3 py-2">¥ {x.principal.toFixed(2)}</td>
                      <td className="px-3 py-2">¥ {x.interest.toFixed(2)}</td>
                      <td className="px-3 py-2">¥ {x.fee.toFixed(2)}</td>
                      <td className="px-3 py-2">¥ {x.totalDue.toFixed(2)}</td>
                      <td className="px-3 py-2">¥ {x.remaining.toFixed(2)}</td>
                      <td className="px-3 py-2">{x.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
