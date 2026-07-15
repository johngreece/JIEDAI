"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { makeClientIdempotencyKey } from "@/lib/client-idempotency";
import { formatMoney } from "@/lib/system-config";

type ReturnedApplication = {
  id: string;
  applicationNo: string;
  amount: number;
  termValue: number;
  purpose: string | null;
  remark: string | null;
  product: {
    name: string;
    minAmount: number;
    maxAmount: number;
    minTermValue: number;
    maxTermValue: number;
    termUnit: string;
  };
};

export function ReturnedLoanApplicationForm({
  application,
  availableLimit,
  returnedReason,
}: {
  application: ReturnedApplication;
  availableLimit: number;
  returnedReason: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(application.amount));
  const [termValue, setTermValue] = useState(String(application.termValue));
  const [purpose, setPurpose] = useState(application.purpose ?? "");
  const [remark, setRemark] = useState(application.remark ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submitKeyRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const maxBorrowable = Math.min(application.product.maxAmount, availableLimit);

  const clearSubmitKey = () => {
    submitKeyRef.current = null;
  };

  async function resubmit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlightRef.current) return;

    const idempotencyKey =
      submitKeyRef.current ?? makeClientIdempotencyKey("client-loan-application-resubmit");
    submitKeyRef.current = idempotencyKey;
    inFlightRef.current = true;
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(
        `/api/client/loan-applications/${application.id}/resubmit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-idempotency-key": idempotencyKey,
          },
          body: JSON.stringify({
            amount: Number(amount),
            termValue: Number(termValue),
            purpose: purpose || undefined,
            remark: remark || undefined,
          }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        submitKeyRef.current = null;
        setError(data.error ?? "重新提交失败");
        if (response.status === 428) {
          router.push("/client/profile?required=1");
        }
        return;
      }

      submitKeyRef.current = null;
      router.refresh();
    } catch {
      setError("网络异常，请再次提交；系统会阻止同一次请求重复流转。");
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className="stat-tile rounded-2xl p-5">
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-lg font-semibold text-slate-900">补充并重新提交</h2>
        <p className="mt-1 text-sm text-slate-600">
          申请 {application.applicationNo} 已退回，请根据原因修改后重新进入风控。
        </p>
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          退回原因：{returnedReason}
        </div>
      </div>

      <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={resubmit}>
        <label className="space-y-1.5 text-sm">
          <span className="text-slate-600">借款产品</span>
          <input className="input-base" value={application.product.name} disabled />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="text-slate-600">申请金额</span>
          <input
            className="input-base"
            type="number"
            step="0.01"
            min={application.product.minAmount}
            max={maxBorrowable}
            value={amount}
            onChange={(event) => {
              clearSubmitKey();
              setAmount(event.target.value);
            }}
            disabled={submitting}
            required
          />
          <span className="block text-xs text-slate-500">
            当前范围 {formatMoney(application.product.minAmount)} - {formatMoney(maxBorrowable)}
          </span>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="text-slate-600">借款期限</span>
          <input
            className="input-base"
            type="number"
            min={application.product.minTermValue}
            max={application.product.maxTermValue}
            value={termValue}
            onChange={(event) => {
              clearSubmitKey();
              setTermValue(event.target.value);
            }}
            disabled={submitting}
            required
          />
          <span className="block text-xs text-slate-500">
            {application.product.minTermValue} - {application.product.maxTermValue}
            {application.product.termUnit === "DAY" ? " 天" : " 个月"}
          </span>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="text-slate-600">借款用途</span>
          <input
            className="input-base"
            value={purpose}
            onChange={(event) => {
              clearSubmitKey();
              setPurpose(event.target.value);
            }}
            disabled={submitting}
          />
        </label>
        <label className="space-y-1.5 text-sm md:col-span-2">
          <span className="text-slate-600">补充说明</span>
          <textarea
            className="input-base min-h-28"
            value={remark}
            onChange={(event) => {
              clearSubmitKey();
              setRemark(event.target.value);
            }}
            disabled={submitting}
          />
        </label>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 md:col-span-2">
            {error}
          </div>
        ) : null}

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={submitting || maxBorrowable < application.product.minAmount}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "重新提交中..." : "修改并重新提交"}
          </button>
        </div>
      </form>
    </section>
  );
}
