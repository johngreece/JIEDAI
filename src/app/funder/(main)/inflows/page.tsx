"use client";

import { formatMoney as money } from "@/lib/system-config";

import { useEffect, useMemo, useRef, useState } from "react";
import { makeClientIdempotencyKey } from "@/lib/client-idempotency";

type FundAccount = {
  id: string;
  accountName: string;
  bankName: string;
  accountNo: string;
  balance: number;
};

type CapitalInflow = {
  id: string;
  amount: number;
  channel: string;
  inflowDate: string;
  status: string;
  remark: string | null;
  createdAt: string;
  fundAccount: {
    id: string;
    accountName: string;
    bankName: string;
    accountNo: string;
  };
  proofs: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    createdAt: string;
  }>;
};

type InflowData = {
  accounts: FundAccount[];
  items: CapitalInflow[];
};

const statusLabel: Record<string, string> = {
  PENDING: "待后台确认",
  CONFIRMED: "已确认到账",
  CANCELLED: "已驳回/取消",
};

const statusBadge: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  CONFIRMED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default function FunderInflowsPage() {
  const [data, setData] = useState<InflowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const submitKeyRef = useRef<string | null>(null);
  const submitInFlightRef = useRef(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    fundAccountId: "",
    amount: "",
    channel: "BANK_TRANSFER",
    inflowDate: new Date().toISOString().slice(0, 10),
    remark: "",
  });
  const [proof, setProof] = useState<File | null>(null);

  const loadData = () => {
    fetch("/api/funder/inflows")
      .then((response) => response.json())
      .then((payload) => {
        setData(payload);
        const firstAccount = payload.accounts?.[0]?.id;
        if (firstAccount) {
          setForm((current) => ({
            ...current,
            fundAccountId: current.fundAccountId || firstAccount,
          }));
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const totals = useMemo(() => {
    const items = data?.items ?? [];
    return {
      pending: items
        .filter((item) => item.status === "PENDING")
        .reduce((sum, item) => sum + item.amount, 0),
      confirmed: items
        .filter((item) => item.status === "CONFIRMED")
        .reduce((sum, item) => sum + item.amount, 0),
      rejected: items.filter((item) => item.status === "CANCELLED").length,
    };
  }, [data]);
  const clearSubmitKey = () => {
    submitKeyRef.current = null;
  };

  const submit = async () => {
    setError("");
    const amount = Number(form.amount);

    if (!form.fundAccountId) {
      setError("请选择入金账户");
      return;
    }

    if (!amount || amount <= 0) {
      setError("请输入有效入金金额");
      return;
    }

    if (!proof) {
      setError("请上传银行转账凭证");
      return;
    }

    const formData = new FormData();
    formData.append("fundAccountId", form.fundAccountId);
    formData.append("amount", String(amount));
    formData.append("channel", form.channel);
    formData.append("inflowDate", new Date(form.inflowDate).toISOString());
    formData.append("remark", form.remark);
    formData.append("proof", proof);

    if (submitInFlightRef.current) return;
    const idempotencyKey = submitKeyRef.current ?? makeClientIdempotencyKey("funder-inflow");
    submitKeyRef.current = idempotencyKey;
    submitInFlightRef.current = true;
    setSubmitting(true);
    try {
      const response = await fetch("/api/funder/inflows", {
        method: "POST",
        headers: {
          "x-idempotency-key": idempotencyKey,
        },
        body: formData,
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        submitKeyRef.current = null;
        setError(result.error || "提交失败");
        return;
      }

      submitKeyRef.current = null;
      setForm((current) => ({
        ...current,
        amount: "",
        remark: "",
      }));
      setProof(null);
      loadData();
    } catch {
      setError("网络异常，请再次提交；系统会按同一次请求防止重复生成入金申请。");
    } finally {
      submitInFlightRef.current = false;
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

  if (!data) {
    return <div className="py-12 text-center text-slate-500">加载失败，请稍后重试。</div>;
  }

  return (
    <div className="space-y-6">
      <header className="panel-soft rounded-2xl px-5 py-4">
        <h1 className="text-2xl font-bold text-slate-900">入金申请</h1>
        <p className="mt-1 text-sm text-slate-600">
          资金方提交银行转账凭证后，后台财务确认到账，确认前不会增加可用余额。
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryCard title="待确认入金" value={money(totals.pending)} />
        <SummaryCard title="已确认入金" value={money(totals.confirmed)} tone="emerald" />
        <SummaryCard title="驳回/取消记录" value={String(totals.rejected)} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
          <h2 className="text-lg font-semibold text-slate-900">提交入金凭证</h2>
          <div className="mt-4 grid gap-4">
            <label className="text-sm text-slate-600">
              入金账户
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={form.fundAccountId}
                onChange={(event) => {
                  clearSubmitKey();
                  setForm({ ...form, fundAccountId: event.target.value });
                }}
              >
                {data.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.accountName} · {account.bankName} · 当前余额 {money(account.balance)}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-slate-600">
              入金金额
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="0.00"
                value={form.amount}
                onChange={(event) => {
                  clearSubmitKey();
                  setForm({ ...form, amount: event.target.value });
                }}
              />
            </label>

            <label className="text-sm text-slate-600">
              转账日期
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={form.inflowDate}
                onChange={(event) => {
                  clearSubmitKey();
                  setForm({ ...form, inflowDate: event.target.value });
                }}
              />
            </label>

            <label className="text-sm text-slate-600">
              转账凭证
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                onChange={(event) => {
                  clearSubmitKey();
                  setProof(event.target.files?.[0] ?? null);
                }}
              />
            </label>

            <label className="text-sm text-slate-600">
              备注
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="可填写银行流水号、付款账户等"
                value={form.remark}
                onChange={(event) => {
                  clearSubmitKey();
                  setForm({ ...form, remark: event.target.value });
                }}
              />
            </label>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <button
              type="button"
              onClick={submit}
              disabled={submitting || data.accounts.length === 0}
              className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "提交中..." : "提交入金申请"}
            </button>
          </div>
        </div>

        <div className="stat-tile rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-slate-900">入金记录</h2>
          {data.items.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
              暂无入金记录。
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left">日期</th>
                    <th className="px-4 py-3 text-left">账户</th>
                    <th className="px-4 py-3 text-left">金额</th>
                    <th className="px-4 py-3 text-left">状态</th>
                    <th className="px-4 py-3 text-left">凭证</th>
                    <th className="px-4 py-3 text-left">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-500">{formatDate(item.inflowDate)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{item.fundAccount.accountName}</div>
                        <div className="text-xs text-slate-500">{item.fundAccount.bankName}</div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{money(item.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadge[item.status] ?? "bg-slate-100 text-slate-600"}`}>
                          {statusLabel[item.status] ?? item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {item.proofs.length > 0 ? item.proofs.map((proofItem) => proofItem.fileName).join(", ") : "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{item.remark || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  tone = "default",
}: {
  title: string;
  value: string;
  tone?: "default" | "emerald";
}) {
  return (
    <div className="stat-tile rounded-2xl p-5">
      <div className="text-sm text-slate-500">{title}</div>
      <div className={`mt-3 text-2xl font-bold ${tone === "emerald" ? "text-emerald-600" : "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}
