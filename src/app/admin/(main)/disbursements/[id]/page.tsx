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
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/disbursements/${params.id}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to load disbursement");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load disbursement");
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
      if (!res.ok) throw new Error(json.error ?? "Failed to confirm disbursement");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to confirm disbursement");
    } finally {
      setActing(false);
    }
  }

  async function deleteDisbursement() {
    if (!data) return;
    if (!window.confirm(`Delete disbursement "${data.disbursementNo}"? Only pending records can be removed.`)) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/disbursements/${params.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to delete disbursement");
      window.location.href = "/admin/disbursements";
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete disbursement");
      setDeleting(false);
    }
  }

  if (loading) return <div className="p-4">Loading...</div>;
  if (error || !data) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error || "Disbursement not found"}</div>;
  }

  return (
    <div className="space-y-6">
      <header className="panel-soft admin-page-header">
        <div className="admin-page-header__meta">
          <span className="admin-page-header__eyebrow">Disbursement Detail</span>
          <h1 className="admin-page-header__title">{data.disbursementNo}</h1>
          <p className="admin-page-header__description">
            Review the gross amount, net amount, source account, and repayment plan generated after payout.
          </p>
          <div className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs ${getStatusBadgeClass(data.status)}`}>
            {getStatusLabel(data.status)}
          </div>
        </div>
        <div className="admin-toolbar-group">
          {data.status === "PENDING" ? (
            <button disabled={acting} onClick={confirmPaid} className="admin-btn admin-btn-primary disabled:opacity-50">
              {acting ? "Processing..." : "Confirm Paid"}
            </button>
          ) : null}
          {data.status === "PENDING" ? (
            <button disabled={deleting} onClick={deleteDisbursement} className="admin-btn admin-btn-danger disabled:opacity-50">
              {deleting ? "Deleting..." : "Delete"}
            </button>
          ) : null}
          <Link href="/admin/disbursements" className="admin-btn admin-btn-secondary">Back to List</Link>
        </div>
      </header>

      <section className="admin-stat-grid md:grid-cols-3">
        <div className="stat-tile admin-stat-card">
          <p className="admin-stat-card__label">Gross Amount</p>
          <p className="admin-stat-card__value">EUR {data.amount.toFixed(2)}</p>
        </div>
        <div className="stat-tile admin-stat-card">
          <p className="admin-stat-card__label">Fee</p>
          <p className="admin-stat-card__value">EUR {data.feeAmount.toFixed(2)}</p>
        </div>
        <div className="stat-tile admin-stat-card">
          <p className="admin-stat-card__label">Net Paid</p>
          <p className="admin-stat-card__value text-emerald-700">EUR {data.netAmount.toFixed(2)}</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="admin-section-card">
          <div className="admin-section-card__header">
            <div>
              <div className="admin-section-card__title">Application</div>
              <p className="admin-section-card__description">Cross-check the linked loan application, customer, and product.</p>
            </div>
          </div>
          <div className="admin-section-card__body space-y-2">
            <p className="text-sm">Application No: {data.application.applicationNo}</p>
            <p className="text-sm">Customer: {data.application.customer.name} ({data.application.customer.phone})</p>
            <p className="text-sm">Product: {data.application.product.name}</p>
            <p className="text-sm">Application Status: {getStatusLabel(data.application.status)}</p>
          </div>
        </div>

        <div className="admin-section-card">
          <div className="admin-section-card__header">
            <div>
              <div className="admin-section-card__title">Fund Account</div>
              <p className="admin-section-card__description">Verify the funding source and the current account balance.</p>
            </div>
          </div>
          <div className="admin-section-card__body space-y-2">
            <p className="text-sm">Funder: {data.fundAccount.funder.name}</p>
            <p className="text-sm">Account: {data.fundAccount.accountName}</p>
            <p className="text-sm">Account No: {data.fundAccount.accountNo}</p>
            <p className="text-sm">Current Balance: EUR {data.fundAccount.balance.toFixed(2)}</p>
          </div>
        </div>
      </section>

      <section className="table-shell admin-table-shell">
        <div className="admin-table-toolbar">
          <div>
            <div className="admin-table-title">Repayment Plan Preview</div>
            <p className="admin-table-note">
              The repayment plan is created automatically after payout confirmation. Review principal, fee, total due, and line status here.
            </p>
          </div>
        </div>

        <div className="px-4 py-4">
          {!data.repaymentPlan ? (
            <p className="text-sm text-slate-500">No repayment plan has been generated yet.</p>
          ) : (
            <div className="space-y-4">
              <div className="admin-kpi-strip">
                <div className="admin-kpi-strip__item">
                  <p className="admin-kpi-strip__label">Plan No</p>
                  <p className="admin-kpi-strip__value">{data.repaymentPlan.planNo}</p>
                </div>
                <div className="admin-kpi-strip__item">
                  <p className="admin-kpi-strip__label">Periods</p>
                  <p className="admin-kpi-strip__value">{data.repaymentPlan.totalPeriods}</p>
                </div>
                <div className="admin-kpi-strip__item">
                  <p className="admin-kpi-strip__label">Principal</p>
                  <p className="admin-kpi-strip__value">EUR {data.repaymentPlan.totalPrincipal.toFixed(2)}</p>
                </div>
                <div className="admin-kpi-strip__item">
                  <p className="admin-kpi-strip__label">Interest</p>
                  <p className="admin-kpi-strip__value">EUR {data.repaymentPlan.totalInterest.toFixed(2)}</p>
                </div>
                <div className="admin-kpi-strip__item">
                  <p className="admin-kpi-strip__label">Fee</p>
                  <p className="admin-kpi-strip__value">EUR {data.repaymentPlan.totalFee.toFixed(2)}</p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-[1.2rem] border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left">Period</th>
                      <th className="px-3 py-2 text-left">Due Date</th>
                      <th className="px-3 py-2 text-left">Principal</th>
                      <th className="px-3 py-2 text-left">Interest</th>
                      <th className="px-3 py-2 text-left">Fee</th>
                      <th className="px-3 py-2 text-left">Total Due</th>
                      <th className="px-3 py-2 text-left">Remaining</th>
                      <th className="px-3 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.repaymentPlan.items.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-4 text-slate-500">Plan created, but no schedule lines exist yet.</td>
                      </tr>
                    ) : data.repaymentPlan.items.map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="px-3 py-2">#{item.periodNumber}</td>
                        <td className="px-3 py-2">{new Date(item.dueDate).toLocaleDateString()}</td>
                        <td className="px-3 py-2">EUR {item.principal.toFixed(2)}</td>
                        <td className="px-3 py-2">EUR {item.interest.toFixed(2)}</td>
                        <td className="px-3 py-2">EUR {item.fee.toFixed(2)}</td>
                        <td className="px-3 py-2">EUR {item.totalDue.toFixed(2)}</td>
                        <td className="px-3 py-2">EUR {item.remaining.toFixed(2)}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${getStatusBadgeClass(item.status)}`}>
                            {getStatusLabel(item.status)}
                          </span>
                        </td>
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
