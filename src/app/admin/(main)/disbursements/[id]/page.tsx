"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getStatusBadgeClass, getStatusLabel } from "@/lib/status-ui";

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

export default function DisbursementDetailPage() {
  const params = useParams<{ id: string }>();
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
      <header className="panel-soft admin-page-header">
        <div className="admin-page-header__meta">
          <span className="admin-page-header__eyebrow">Disbursement Detail</span>
          <h1 className="admin-page-header__title">{data.disbursementNo}</h1>
          <p className="admin-page-header__description">查看放款金额、到账净额、资金账户和还款计划生成情况。</p>
          <div className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs ${getStatusBadgeClass(data.status)}`}>{getStatusLabel(data.status)}</div>
        </div>
        <div className="admin-toolbar-group">
          {data.status === "PENDING" ? (
            <button disabled={acting} onClick={confirmPaid} className="admin-btn admin-btn-primary disabled:opacity-50">
              {acting ? "处理中..." : "确认打款"}
            </button>
          ) : null}
          <Link href="/admin/disbursements" className="admin-btn admin-btn-secondary">返回列表</Link>
        </div>
      </header>

      <section className="admin-stat-grid md:grid-cols-3">
        <div className="stat-tile admin-stat-card"><p className="admin-stat-card__label">放款金额</p><p className="admin-stat-card__value">€ {data.amount.toFixed(2)}</p></div>
        <div className="stat-tile admin-stat-card"><p className="admin-stat-card__label">手续费</p><p className="admin-stat-card__value">€ {data.feeAmount.toFixed(2)}</p></div>
        <div className="stat-tile admin-stat-card"><p className="admin-stat-card__label">净到账</p><p className="admin-stat-card__value text-emerald-700">€ {data.netAmount.toFixed(2)}</p></div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="admin-section-card">
          <div className="admin-section-card__header">
            <div>
              <div className="admin-section-card__title">申请信息</div>
              <p className="admin-section-card__description">对照放款单查看所属申请、客户和产品。</p>
            </div>
          </div>
          <div className="admin-section-card__body space-y-2">
          <p className="text-sm">申请单：{data.application.applicationNo}</p>
          <p className="text-sm">客户：{data.application.customer.name}（{data.application.customer.phone}）</p>
          <p className="text-sm">产品：{data.application.product.name}</p>
          <p className="text-sm">申请状态：{getStatusLabel(data.application.status)}</p>
          </div>
        </div>
        <div className="admin-section-card">
          <div className="admin-section-card__header">
            <div>
              <div className="admin-section-card__title">资金账户</div>
              <p className="admin-section-card__description">核对资金方、打款账户和账户余额。</p>
            </div>
          </div>
          <div className="admin-section-card__body space-y-2">
          <p className="text-sm">资金方：{data.fundAccount.funder.name}</p>
          <p className="text-sm">账户：{data.fundAccount.accountName}</p>
          <p className="text-sm">账号：{data.fundAccount.accountNo}</p>
          <p className="text-sm">当前余额：€ {data.fundAccount.balance.toFixed(2)}</p>
          </div>
        </div>
      </section>

      <section className="table-shell admin-table-shell">
        <div className="admin-table-toolbar">
          <div>
            <div className="admin-table-title">还款计划可视化</div>
            <p className="admin-table-note">确认打款后自动生成还款计划，可在此直接核对本金、利息、费用和每期期次。</p>
          </div>
        </div>
        <div className="px-4 py-4">
        {!data.repaymentPlan ? (
          <p className="text-sm text-slate-500">尚未生成还款计划（确认打款后自动生成）</p>
        ) : (
          <div className="space-y-4">
            <div className="admin-kpi-strip">
              <div className="admin-kpi-strip__item"><p className="admin-kpi-strip__label">计划编号</p><p className="admin-kpi-strip__value">{data.repaymentPlan.planNo}</p></div>
              <div className="admin-kpi-strip__item"><p className="admin-kpi-strip__label">期数</p><p className="admin-kpi-strip__value">{data.repaymentPlan.totalPeriods}</p></div>
              <div className="admin-kpi-strip__item"><p className="admin-kpi-strip__label">本金</p><p className="admin-kpi-strip__value">€ {data.repaymentPlan.totalPrincipal.toFixed(2)}</p></div>
              <div className="admin-kpi-strip__item"><p className="admin-kpi-strip__label">利息</p><p className="admin-kpi-strip__value">€ {data.repaymentPlan.totalInterest.toFixed(2)}</p></div>
              <div className="admin-kpi-strip__item"><p className="admin-kpi-strip__label">费用</p><p className="admin-kpi-strip__value">€ {data.repaymentPlan.totalFee.toFixed(2)}</p></div>
            </div>

            <div className="overflow-x-auto rounded-[1.2rem] border border-slate-200">
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
                      <td className="px-3 py-2">€ {x.principal.toFixed(2)}</td>
                      <td className="px-3 py-2">€ {x.interest.toFixed(2)}</td>
                      <td className="px-3 py-2">€ {x.fee.toFixed(2)}</td>
                      <td className="px-3 py-2">€ {x.totalDue.toFixed(2)}</td>
                      <td className="px-3 py-2">€ {x.remaining.toFixed(2)}</td>
                      <td className="px-3 py-2"><span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${getStatusBadgeClass(x.status)}`}>{getStatusLabel(x.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </div>
      </section>
    </div>
  );
}
