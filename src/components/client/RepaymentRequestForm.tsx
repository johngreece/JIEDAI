"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  outstandingAmount: number;
  blocked: boolean;
  blockedReason?: string | null;
};

function money(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function RepaymentRequestForm({ outstandingAmount, blocked, blockedReason }: Props) {
  const router = useRouter();
  const [amount, setAmount] = useState(outstandingAmount > 0 ? String(outstandingAmount) : "");
  const [paymentMethod, setPaymentMethod] = useState("BANK_TRANSFER");
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/client/repayments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(amount),
          paymentMethod,
          remark: remark || undefined,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "还款申请提交失败");
        return;
      }

      setMessage(`还款申请 ${data.repaymentNo} 已提交，后台会尽快核对并处理。`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="stat-tile rounded-2xl p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">发起还款申请</h2>
          <p className="mt-1 text-sm text-slate-600">当前待还金额按实时规则计算。客户提交后，管理端会收到提醒并进入待分配处理队列。</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          当前待还金额
          <div className="mt-1 text-base font-semibold text-slate-900">{money(outstandingAmount)}</div>
        </div>
      </div>

      <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={submit}>
        <label className="space-y-1.5 text-sm">
          <span className="text-slate-600">申请还款金额</span>
          <input
            className="input-base"
            type="number"
            step="0.01"
            min={0.01}
            max={outstandingAmount}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            disabled={submitting || blocked}
            required
          />
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="text-slate-600">付款方式</span>
          <select
            className="input-base"
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value)}
            disabled={submitting || blocked}
          >
            <option value="BANK_TRANSFER">银行转账</option>
            <option value="ONLINE">线上支付</option>
            <option value="CASH">现金</option>
          </select>
        </label>

        <label className="space-y-1.5 text-sm md:col-span-2">
          <span className="text-slate-600">备注</span>
          <textarea
            className="input-base min-h-24"
            value={remark}
            onChange={(event) => setRemark(event.target.value)}
            disabled={submitting || blocked}
            placeholder="可填写付款时间、转账尾号、付款渠道等"
          />
        </label>

        {blocked && blockedReason ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 md:col-span-2">
            {blockedReason}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 md:col-span-2">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 md:col-span-2">
            {message}
          </div>
        ) : null}

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={submitting || blocked || outstandingAmount <= 0}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "提交中..." : "提交还款申请"}
          </button>
        </div>
      </form>
    </section>
  );
}
