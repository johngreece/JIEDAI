"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { makeClientIdempotencyKey } from "@/lib/client-idempotency";

type Proof = { id: string; fileName: string; fileUrl: string };
type Account = {
  id: string;
  accountName: string;
  bankName: string;
  accountNo: string;
  balance: number;
  funder: { id: string; name: string };
};
type Inflow = {
  id: string;
  amount: number;
  channel: string;
  transactionId: string;
  senderBank: string;
  senderAccount: string;
  inflowDate: string;
  status: string;
  remark: string | null;
  reviewedAt: string | null;
  reviewedBy: { id: string; realName: string } | null;
  createdAt: string;
  fundAccount: Omit<Account, "balance">;
  proofs: Proof[];
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "待复核",
  CONFIRMED: "已确认",
  CANCELLED: "已驳回/撤销",
};

function money(value: number) {
  return `EUR ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function dateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export default function CapitalInflowsPageClient() {
  const [items, setItems] = useState<Inflow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("ALL");
  const [rejectTarget, setRejectTarget] = useState<Inflow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [inflowDate, setInflowDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [transactionId, setTransactionId] = useState("");
  const [senderBank, setSenderBank] = useState("");
  const [senderAccount, setSenderAccount] = useState("");
  const [remark, setRemark] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const createKeyRef = useRef("");
  const actionKeysRef = useRef(new Map<string, string>());

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/capital-inflows", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.message || "资金流入加载失败");
      setItems(Array.isArray(data.items) ? data.items : []);
      setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
      setAccountId((current) => current || data.accounts?.[0]?.id || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "资金流入加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredItems = useMemo(
    () => (status === "ALL" ? items : items.filter((item) => item.status === status)),
    [items, status],
  );
  const pendingCount = items.filter((item) => item.status === "PENDING").length;
  const confirmedTotal = items
    .filter((item) => item.status === "CONFIRMED")
    .reduce((sum, item) => sum + item.amount, 0);

  function invalidateCreateKey() {
    createKeyRef.current = "";
  }

  async function createInflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!proof || !accountId || busy) return;
    if (!createKeyRef.current) {
      createKeyRef.current = makeClientIdempotencyKey("admin-capital-inflow-create");
    }

    const formData = new FormData();
    formData.append("amount", amount);
    formData.append("channel", "BANK_TRANSFER");
    formData.append("inflowDate", new Date(`${inflowDate}T12:00:00.000Z`).toISOString());
    formData.append("transactionId", transactionId);
    formData.append("senderBank", senderBank);
    formData.append("senderAccount", senderAccount);
    formData.append("proof", proof);
    if (remark.trim()) formData.append("remark", remark.trim());

    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/fund-accounts/${accountId}/inflows`, {
        method: "POST",
        headers: { "x-idempotency-key": createKeyRef.current },
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "资金流入登记失败");
      createKeyRef.current = "";
      setAmount("");
      setTransactionId("");
      setSenderBank("");
      setSenderAccount("");
      setRemark("");
      setProof(null);
      const input = form.elements.namedItem("proof") as HTMLInputElement | null;
      if (input) input.value = "";
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "资金流入登记失败");
    } finally {
      setBusy(false);
    }
  }

  async function review(item: Inflow, action: "confirm" | "reject") {
    if (busy) return;
    const scope = `${item.id}:${action}`;
    if (!actionKeysRef.current.has(scope)) {
      actionKeysRef.current.set(scope, makeClientIdempotencyKey(`capital-inflow-${action}`));
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/fund-accounts/${item.fundAccount.id}/inflows/${item.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-idempotency-key": actionKeysRef.current.get(scope) || "",
          },
          body: JSON.stringify({
            action,
            reason: action === "reject" ? rejectReason.trim() : undefined,
          }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "资金流入复核失败");
      actionKeysRef.current.delete(scope);
      setRejectTarget(null);
      setRejectReason("");
      await load();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "资金流入复核失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 2xl:space-y-6">
      <header className="panel-soft admin-page-header">
        <div className="admin-page-header__meta">
          <span className="admin-page-header__eyebrow">Capital Inflows</span>
          <h1 className="admin-page-header__title">资金流入审核</h1>
          <p className="admin-page-header__description">
            统一登记与复核 EUR 入金，银行流水、付款账户、凭证和复核人完整留痕。
          </p>
        </div>
        <div className="admin-kpi-strip md:min-w-[420px]">
          <Metric label="待复核" value={String(pendingCount)} />
          <Metric label="已确认入金" value={money(confirmedTotal)} />
          <Metric label="总记录" value={String(items.length)} />
        </div>
      </header>

      {error ? (
        <div role="alert" className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="admin-section-card">
        <div className="admin-section-card__header">
          <div>
            <div className="admin-section-card__title">财务直接登记</div>
            <p className="admin-section-card__description">提交后立即确认入账；缺少银行证据时系统拒绝登记。</p>
          </div>
        </div>
        <form className="admin-section-card__body grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={createInflow}>
          <Field label="资金账户">
            <select
              className="admin-field w-full"
              value={accountId}
              onChange={(event) => { invalidateCreateKey(); setAccountId(event.target.value); }}
              required
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.funder.name} · {account.accountName} · {account.accountNo}
                </option>
              ))}
            </select>
          </Field>
          <Field label="金额（EUR）">
            <input className="admin-field w-full" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => { invalidateCreateKey(); setAmount(event.target.value); }} required />
          </Field>
          <Field label="到账日期">
            <input className="admin-field w-full" type="date" value={inflowDate} onChange={(event) => { invalidateCreateKey(); setInflowDate(event.target.value); }} required />
          </Field>
          <Field label="银行流水号">
            <input className="admin-field w-full" value={transactionId} onChange={(event) => { invalidateCreateKey(); setTransactionId(event.target.value); }} maxLength={120} required />
          </Field>
          <Field label="付款银行">
            <input className="admin-field w-full" value={senderBank} onChange={(event) => { invalidateCreateKey(); setSenderBank(event.target.value); }} maxLength={120} required />
          </Field>
          <Field label="付款账户/IBAN">
            <input className="admin-field w-full" value={senderAccount} onChange={(event) => { invalidateCreateKey(); setSenderAccount(event.target.value); }} maxLength={120} required />
          </Field>
          <Field label="银行凭证">
            <input name="proof" className="admin-field w-full" type="file" accept="image/*,.pdf" onChange={(event) => { invalidateCreateKey(); setProof(event.target.files?.[0] ?? null); }} required />
          </Field>
          <Field label="备注">
            <input className="admin-field w-full" value={remark} onChange={(event) => { invalidateCreateKey(); setRemark(event.target.value); }} maxLength={500} />
          </Field>
          <div className="md:col-span-2 xl:col-span-4 flex justify-end">
            <button className="admin-btn admin-btn-primary" type="submit" disabled={busy || !proof || !accountId}>
              {busy ? "处理中..." : "确认并登记入账"}
            </button>
          </div>
        </form>
      </section>

      <section className="table-shell admin-table-shell">
        <div className="admin-table-toolbar">
          <div>
            <div className="admin-table-title">入金记录</div>
            <p className="admin-table-note">资金方自助提交的记录需要财务确认，直接登记记录已自动留存复核人。</p>
          </div>
          <div className="flex items-center gap-2">
            <select className="admin-field" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="ALL">全部状态</option>
              <option value="PENDING">待复核</option>
              <option value="CONFIRMED">已确认</option>
              <option value="CANCELLED">已驳回/撤销</option>
            </select>
            <button type="button" className="admin-btn admin-btn-secondary" onClick={() => void load()} disabled={loading}>刷新</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1180px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left">
              <th className="px-4 py-3">资金方 / 账户</th><th className="px-4 py-3">金额</th>
              <th className="px-4 py-3">银行证据</th><th className="px-4 py-3">到账日期</th>
              <th className="px-4 py-3">状态</th><th className="px-4 py-3">复核留痕</th><th className="px-4 py-3">操作</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">加载中...</td></tr> : null}
              {!loading && filteredItems.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">暂无记录</td></tr> : null}
              {!loading ? filteredItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3"><div className="font-medium text-slate-900">{item.fundAccount.funder.name}</div><div className="mt-1 text-xs text-slate-500">{item.fundAccount.accountName} · {item.fundAccount.accountNo}</div></td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{money(item.amount)}</td>
                  <td className="px-4 py-3"><div className="font-mono text-xs text-slate-800">{item.transactionId}</div><div className="mt-1 text-xs text-slate-500">{item.senderBank} · {item.senderAccount}</div><div className="mt-1 flex flex-wrap gap-2">{item.proofs.map((entry) => <a key={entry.id} href={entry.fileUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-600 hover:underline">{entry.fileName}</a>)}</div></td>
                  <td className="px-4 py-3 text-xs text-slate-500">{dateTime(item.inflowDate)}</td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded border px-2 py-1 text-xs font-medium ${item.status === "CONFIRMED" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : item.status === "PENDING" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>{STATUS_LABELS[item.status] || item.status}</span></td>
                  <td className="px-4 py-3 text-xs text-slate-500">{item.reviewedBy?.realName || "-"}<div>{dateTime(item.reviewedAt)}</div></td>
                  <td className="px-4 py-3">{item.status === "PENDING" ? <div className="flex gap-2"><button type="button" className="admin-btn admin-btn-success admin-btn-sm" disabled={busy} onClick={() => { if (window.confirm(`确认 ${item.transactionId} 已到账并入账？`)) void review(item, "confirm"); }}>确认到账</button><button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" disabled={busy} onClick={() => { setRejectTarget(item); setRejectReason(""); }}>驳回</button></div> : "-"}</td>
                </tr>
              )) : null}
            </tbody>
          </table>
        </div>
      </section>

      {rejectTarget ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/35 p-4" role="dialog" aria-modal="true" aria-label="驳回资金流入">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-slate-900">驳回资金流入</h2>
            <p className="mt-2 text-sm text-slate-500">{rejectTarget.fundAccount.funder.name} · {money(rejectTarget.amount)} · {rejectTarget.transactionId}</p>
            <textarea className="admin-field mt-4 min-h-24 w-full" value={rejectReason} onChange={(event) => { actionKeysRef.current.delete(`${rejectTarget.id}:reject`); setRejectReason(event.target.value); }} placeholder="填写驳回原因" maxLength={500} required />
            <div className="mt-4 flex justify-end gap-2"><button type="button" className="admin-btn admin-btn-secondary" disabled={busy} onClick={() => setRejectTarget(null)}>取消</button><button type="button" className="admin-btn admin-btn-danger" disabled={busy || !rejectReason.trim()} onClick={() => void review(rejectTarget, "reject")}>确认驳回</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>{children}</label>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="admin-kpi-strip__item"><div className="admin-kpi-strip__label">{label}</div><div className="admin-kpi-strip__value">{value}</div></div>;
}
