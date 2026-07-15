"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { makeClientIdempotencyKey } from "@/lib/client-idempotency";
import { DisbursementConfirmationDialog } from "@/components/admin/DisbursementConfirmationDialog";

type LoanItem = {
  id: string;
  applicationNo: string;
  amount: number;
  contractTerms: {
    currency: string;
    basePrincipal: number;
    legalServiceFee: number;
    upfrontFeeAmount: number;
    netDisbursementAmount: number;
  } | null;
  customer: { name: string };
  product: { name: string };
};

type FundAccount = {
  id: string;
  accountName: string;
  bankName: string;
  accountNo: string;
  balance: number;
  funder: { name: string };
};

type Disbursement = {
  id: string;
  disbursementNo: string;
  status: string;
  amount: number;
  feeAmount: number;
  netAmount: number;
  transactionId: string | null;
  payerBank: string | null;
  payerAccount: string | null;
  proofs: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
  }>;
  createdAt: string;
  application: { id: string; applicationNo: string; customer: { name: string; phone: string } };
  fundAccount: { id: string; accountName: string; accountNo: string };
};

export function DisbursementsPageClient() {
  const [status, setStatus] = useState("ALL");
  const [list, setList] = useState<Disbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    id: string;
    disbursementNo: string;
    idempotencyKey: string;
  } | null>(null);

  const [approvedApps, setApprovedApps] = useState<LoanItem[]>([]);
  const [fundAccounts, setFundAccounts] = useState<FundAccount[]>([]);

  const [form, setForm] = useState({
    applicationId: "",
    fundAccountId: "",
    amount: "",
    feeAmount: "0",
    remark: "",
  });
  const [creating, setCreating] = useState(false);

  async function loadList() {
    setLoading(true);
    setError("");
    try {
      const query = status === "ALL" ? "" : `?status=${encodeURIComponent(status)}`;
      const res = await fetch(`/api/disbursements${query}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to load disbursements");
      setList(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load disbursements");
    } finally {
      setLoading(false);
    }
  }

  async function loadOptions() {
    const [appRes, accRes] = await Promise.all([
      fetch("/api/loan-applications?status=CONTRACTED"),
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
    pending: list.filter((item) => item.status === "PENDING").length,
    paid: list.filter((item) => item.status === "PAID").length,
  }), [list]);
  const selectedApplication = approvedApps.find((item) => item.id === form.applicationId) ?? null;

  async function createDisbursement(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/disbursements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": makeClientIdempotencyKey("admin-disbursement-create"),
        },
        body: JSON.stringify({
          applicationId: form.applicationId,
          fundAccountId: form.fundAccountId,
          amount: Number(form.amount),
          feeAmount: Number(form.feeAmount || "0"),
          remark: form.remark || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to create disbursement");

      setForm({
        applicationId: "",
        fundAccountId: "",
        amount: "",
        feeAmount: "0",
        remark: "",
      });

      await Promise.all([loadList(), loadOptions()]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to create disbursement");
    } finally {
      setCreating(false);
    }
  }

  async function confirmPaid(evidence: FormData) {
    if (!confirmTarget) return;
    setActing(confirmTarget.id);
    try {
      const res = await fetch(`/api/disbursements/${confirmTarget.id}/confirm-paid`, {
        method: "POST",
        headers: {
          "x-idempotency-key": confirmTarget.idempotencyKey,
        },
        body: evidence,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to confirm disbursement");
      await Promise.all([loadList(), loadOptions()]);
      setConfirmTarget(null);
    } catch (e) {
      throw e instanceof Error ? e : new Error("Failed to confirm disbursement");
    } finally {
      setActing(null);
    }
  }

  async function deleteDisbursement(item: Disbursement) {
    if (!window.confirm(`Cancel disbursement "${item.disbursementNo}"? Pending records remain in the audit trail.`)) return;

    setDeletingId(item.id);
    try {
      const res = await fetch(`/api/disbursements/${item.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to cancel disbursement");
      await Promise.all([loadList(), loadOptions()]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to cancel disbursement");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="panel-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Disbursement Management</h1>
          <p className="mt-1 text-sm text-slate-600">
            Create payout orders, confirm transfers, and keep test disbursements removable before money is sent.
          </p>
        </div>
        <button onClick={loadList} className="btn-soft rounded-lg px-3 py-2 text-sm">Refresh</button>
      </header>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="stat-tile rounded-xl p-4">
          <p className="text-xs text-slate-500">Total Orders</p>
          <p className="text-xl font-semibold">{stats.total}</p>
        </div>
        <div className="stat-tile rounded-xl p-4">
          <p className="text-xs text-slate-500">Pending</p>
          <p className="text-xl font-semibold">{stats.pending}</p>
        </div>
        <div className="stat-tile rounded-xl p-4">
          <p className="text-xs text-slate-500">Paid</p>
          <p className="text-xl font-semibold">{stats.paid}</p>
        </div>
      </section>

      <section className="panel-soft rounded-xl p-4">
        <h2 className="mb-3 font-semibold text-slate-900">Create Disbursement</h2>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={createDisbursement}>
          <label className="space-y-1 text-sm">
            <span className="text-slate-500">Approved Application</span>
            <select
              required
              value={form.applicationId}
              onChange={(e) => {
                const app = approvedApps.find((item) => item.id === e.target.value);
                setForm((current) => ({
                  ...current,
                  applicationId: e.target.value,
                  amount: app ? String(app.contractTerms?.basePrincipal ?? app.amount) : current.amount,
                  feeAmount: app ? String(app.contractTerms?.upfrontFeeAmount ?? 0) : current.feeAmount,
                }));
              }}
              className="input-base"
            >
              <option value="">Select application</option>
              {approvedApps.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.applicationNo} | {item.customer.name} | EUR {item.amount.toFixed(2)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-500">Fund Account</span>
            <select
              required
              value={form.fundAccountId}
              onChange={(e) => setForm((current) => ({ ...current, fundAccountId: e.target.value }))}
              className="input-base"
            >
              <option value="">Select account</option>
              {fundAccounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.funder.name} | {item.accountName} | Balance EUR {item.balance.toFixed(2)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-500">合同基础本金（EUR）</span>
            <input
              required
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((current) => ({ ...current, amount: e.target.value }))}
              className="input-base"
              readOnly={Boolean(selectedApplication?.contractTerms)}
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-500">本次放款前置扣费（EUR）</span>
            <input
              required
              type="number"
              step="0.01"
              value={form.feeAmount}
              onChange={(e) => setForm((current) => ({ ...current, feeAmount: e.target.value }))}
              className="input-base"
              readOnly={Boolean(selectedApplication?.contractTerms)}
            />
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="text-slate-500">Remark</span>
            <input
              value={form.remark}
              onChange={(e) => setForm((current) => ({ ...current, remark: e.target.value }))}
              className="input-base"
            />
          </label>

          <div className="md:col-span-2">
            <button
              disabled={creating}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Disbursement"}
            </button>
          </div>
        </form>
      </section>

      <section className="table-shell overflow-hidden rounded-xl">
        <div className="flex gap-2 border-b border-slate-100 px-4 py-3">
          <button
            onClick={() => setStatus("ALL")}
            className={`rounded-full border px-3 py-1.5 text-sm ${status === "ALL" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}
          >
            All
          </button>
          <button
            onClick={() => setStatus("PENDING")}
            className={`rounded-full border px-3 py-1.5 text-sm ${status === "PENDING" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}
          >
            Pending
          </button>
          <button
            onClick={() => setStatus("PAID")}
            className={`rounded-full border px-3 py-1.5 text-sm ${status === "PAID" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}
          >
            Paid
          </button>
        </div>

        {error ? <div className="border-t border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left">Disbursement No</th>
                <th className="px-4 py-3 text-left">Application / Customer</th>
                <th className="px-4 py-3 text-left">Amount</th>
                <th className="px-4 py-3 text-left">Fund Account</th>
                <th className="px-4 py-3 text-left">Bank Evidence</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-slate-500">Loading...</td>
                </tr>
              ) : null}

              {!loading && list.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-slate-500">No disbursement records</td>
                </tr>
              ) : null}

              {!loading && list.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-800">{item.disbursementNo}</td>
                  <td className="px-4 py-3">
                    {item.application.applicationNo}
                    <div className="text-xs text-slate-500">
                      {item.application.customer.name} | {item.application.customer.phone}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    EUR {item.amount.toFixed(2)}
                    <div className="text-xs text-slate-500">Net EUR {item.netAmount.toFixed(2)}</div>
                  </td>
                  <td className="px-4 py-3">
                    {item.fundAccount.accountName}
                    <div className="text-xs text-slate-500">{item.fundAccount.accountNo}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-slate-700">{item.transactionId || "-"}</div>
                    {item.proofs.length > 0 ? (
                      <div className="mt-1 space-x-2 text-xs">
                        {item.proofs.map((proof) => (
                          <a
                            key={proof.id}
                            href={proof.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {proof.fileName}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{item.status}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link href={`/admin/disbursements/${item.id}`} className="text-blue-600 hover:underline">Detail</Link>
                      {item.status === "PENDING" ? (
                        <button
                          disabled={acting === item.id}
                          onClick={() =>
                            setConfirmTarget({
                              id: item.id,
                              disbursementNo: item.disbursementNo,
                              idempotencyKey: makeClientIdempotencyKey(
                                "admin-disbursement-confirm-paid",
                              ),
                            })
                          }
                          className="text-emerald-700 hover:underline disabled:opacity-50"
                        >
                          {acting === item.id ? "Processing..." : "Confirm Paid"}
                        </button>
                      ) : null}
                      {item.status === "PENDING" ? (
                        <button
                          disabled={deletingId === item.id}
                          onClick={() => deleteDisbursement(item)}
                          className="text-rose-600 hover:underline disabled:opacity-50"
                        >
                          {deletingId === item.id ? "Cancelling..." : "Cancel"}
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

      <DisbursementConfirmationDialog
        open={Boolean(confirmTarget)}
        disbursementNo={confirmTarget?.disbursementNo ?? ""}
        busy={Boolean(confirmTarget && acting === confirmTarget.id)}
        onClose={() => {
          if (!acting) setConfirmTarget(null);
        }}
        onConfirm={confirmPaid}
      />
    </div>
  );
}
