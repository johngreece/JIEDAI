"use client";

import { formatMoney as money } from "@/lib/system-config";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { makeClientIdempotencyKey } from "@/lib/client-idempotency";

type Props = {
  outstandingAmount: number;
  blocked: boolean;
  blockedReason?: string | null;
};

export function RepaymentRequestForm({ outstandingAmount, blocked, blockedReason }: Props) {
  const router = useRouter();
  const [amount, setAmount] = useState(outstandingAmount > 0 ? String(outstandingAmount) : "");
  const [paymentMethod, setPaymentMethod] = useState("BANK_TRANSFER");
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submitKeyRef = useRef<string | null>(null);
  const submitInFlightRef = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const clearSubmitKey = () => {
    submitKeyRef.current = null;
  };

  useEffect(() => {
    if (!submitting) {
      setAmount(outstandingAmount > 0 ? String(outstandingAmount) : "");
    }
  }, [outstandingAmount, submitting]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitInFlightRef.current) return;

    const idempotencyKey = submitKeyRef.current ?? makeClientIdempotencyKey("client-repayment");
    submitKeyRef.current = idempotencyKey;
    submitInFlightRef.current = true;
    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/client/repayments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          amount: Number(amount),
          paymentMethod,
          remark: remark || undefined,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        submitKeyRef.current = null;
        setError(data.error ?? "还款申请提交失败");
        return;
      }

      submitKeyRef.current = null;
      setMessage(`还款申请 ${data.repaymentNo} 已提交，系统已按提交时刻临时暂停新增利息；已生成利息不变。若后台标记未收款，暂停期间会补算。`);
      router.refresh();
    } catch {
      setError("网络异常，请再次提交；系统会按同一次请求防止重复生成还款申请。");
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <section className="stat-tile rounded-2xl p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">发起还款申请</h2>
          <p className="mt-1 text-sm text-slate-600">
            当前待还金额按实时规则计算。客户点击提交后，系统会按提交时刻临时暂停新增利息，已生成利息不变。
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          当前实时待还
          <div className="mt-1 text-base font-semibold text-slate-900">{money(outstandingAmount)}</div>
        </div>
      </div>

      <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={submit}>
        <label className="space-y-1.5 text-sm">
          <span className="text-slate-600">本次结清金额</span>
          <input
            className="input-base"
            type="number"
            step="0.01"
            min={outstandingAmount}
            max={outstandingAmount}
            value={amount}
            readOnly
            disabled={submitting || blocked}
            required
          />
          <span className="block text-xs text-slate-500">客户端自助还款按全额结清处理；部分还款请联系管理端人工登记。</span>
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="text-slate-600">付款方式</span>
          <select
            className="input-base"
            value={paymentMethod}
            onChange={(event) => {
              clearSubmitKey();
              setPaymentMethod(event.target.value);
            }}
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
            onChange={(event) => {
              clearSubmitKey();
              setRemark(event.target.value);
            }}
            disabled={submitting || blocked}
            placeholder="可填写付款时间、转账尾号、付款渠道等"
          />
        </label>

        {blocked && blockedReason ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 md:col-span-2">
            {blockedReason}
          </div>
        ) : null}

        {!blocked ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 md:col-span-2">
            点击提交后会登记还款申请并临时暂停新增额外利息；如果后台标记未收款，则恢复实时计息并补算暂停期间。
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
            {submitting ? "提交中..." : "提交还款并临时暂停计息"}
          </button>
        </div>
      </form>
    </section>
  );
}
