"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SignCanvas } from "@/components/SignCanvas";

export default function ClientRepaymentSignPage() {
  const params = useParams();
  const id = params.id as string;
  const [repayment, setRepayment] = useState<{
    repaymentNo: string;
    amount: number;
    status: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signing, setSigning] = useState(false);
  const [canvasData, setCanvasData] = useState<string | null>(null);
  const [confirmedAmount, setConfirmedAmount] = useState("");

  useEffect(() => {
    if (!id) return;

    fetch(`/api/repayments/${id}`)
      .then((response) => response.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setRepayment(data);
        setConfirmedAmount(String(data.amount ?? ""));
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, [id]);

  function handleSign() {
    if (!canvasData) {
      setError("请先完成签字");
      return;
    }

    if (!confirmedAmount) {
      setError("请先确认本次付款金额");
      return;
    }

    setSigning(true);
    setError("");

    fetch(`/api/client/repayments/${id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "DECLARED_PAID",
        signatureData: canvasData,
        deviceInfo: navigator.userAgent,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setRepayment((current) =>
          current ? { ...current, status: "CUSTOMER_CONFIRMED" } : null
        );
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setSigning(false));
  }

  if (loading) {
    return <div className="flex items-center justify-center p-6">加载中...</div>;
  }

  if (error && !repayment) {
    return <div className="p-6 text-red-600">{error}</div>;
  }

  if (!repayment) {
    return null;
  }

  if (repayment.status === "CUSTOMER_CONFIRMED") {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 text-center">
          <p className="text-lg font-semibold text-slate-900">已提交付款报备</p>
          <p className="mt-2 text-sm text-slate-600">
            系统会先按你今天已付款处理，等待管理端确认到账。
            如果管理端标记未收款，这笔借款会恢复按原规则继续计息。
          </p>
        </div>
        <div className="flex justify-center">
          <Link href="/client/repayments" className="text-blue-600 hover:underline">
            返回当前还款页
          </Link>
        </div>
      </div>
    );
  }

  if (repayment.status === "CONFIRMED") {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <p className="text-lg font-semibold text-slate-900">后台已确认收款</p>
          <p className="mt-2 text-sm text-slate-600">这笔还款已经正式入账。</p>
        </div>
        <div className="flex justify-center">
          <Link href="/client/repayments" className="text-blue-600 hover:underline">
            返回当前还款页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="panel-soft flex items-center justify-between rounded-xl px-4 py-3">
        <Link href="/client/repayments" className="text-sm text-slate-500 hover:underline">
          返回
        </Link>
        <span className="text-sm text-slate-600">还款单号：{repayment.repaymentNo}</span>
      </div>

      <div className="panel-soft rounded-xl p-4">
        <p className="mb-3 text-sm text-slate-600">
          你点击“确认还款”后，系统会默认先停止当日计息，等待管理端确认到账。
          如果后台标记未收款，这笔本金会继续按之前规则计息。
        </p>
        <label className="block text-sm font-medium text-slate-700">
          本次付款金额
          <input
            value={confirmedAmount}
            onChange={(event) => setConfirmedAmount(event.target.value)}
            className="input-base mt-2"
          />
        </label>
      </div>

      <div className="panel-soft rounded-xl p-4">
        <p className="mb-2 text-sm font-medium text-slate-700">手写签字确认本次付款</p>
        <SignCanvas onDataUrl={setCanvasData} />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="button"
        onClick={handleSign}
        disabled={signing}
        className="w-full rounded-lg bg-blue-600 py-3 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
      >
        {signing ? "提交中..." : "确认已付款"}
      </button>
    </div>
  );
}
