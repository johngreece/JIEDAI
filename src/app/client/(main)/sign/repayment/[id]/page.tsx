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
    paymentMethod: string;
    transactionId: string;
    payerBank: string;
    payerAccount: string;
    proof?: { accessUrl: string; fileName: string } | null;
    rejectReason?: string | null;
    matchComment?: string | null;
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
        confirmedAmount,
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
            如果管理端标记未收款，暂停期间会补算，这笔借款会恢复按原规则继续计息。
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

  if (repayment.status === "REJECTED") {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <p className="text-lg font-semibold text-slate-900">这笔还款被标记为未收到</p>
          <p className="mt-2 text-sm text-slate-700">
            管理端核对后没有匹配到这笔款项，本金将按原规则继续计息。
          </p>
          {repayment.rejectReason ? (
            <div className="mt-3 rounded-lg border border-red-100 bg-white p-3 text-sm text-slate-700">
              <p className="font-medium text-slate-900">驳回原因</p>
              <p className="mt-1 whitespace-pre-line">{repayment.rejectReason}</p>
            </div>
          ) : repayment.matchComment ? (
            <div className="mt-3 rounded-lg border border-red-100 bg-white p-3 text-sm text-slate-700">
              <p className="font-medium text-slate-900">管理端备注</p>
              <p className="mt-1 whitespace-pre-line">{repayment.matchComment}</p>
            </div>
          ) : null}
          <p className="mt-3 text-xs text-slate-500">
            如对处理结果有异议，请联系业务员复核；你也可以重新提交一笔新的还款申请。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/client/repayments"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 hover:no-underline"
          >
            返回并重新发起还款
          </Link>
          <Link
            href="/client/notifications"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:no-underline"
          >
            查看消息中心
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
          你点击“确认还款”后，系统会默认先临时停止当日计息，等待管理端确认到账。
          如果后台标记未收款，暂停期间会补算，这笔本金会继续按之前规则计息。
        </p>
        <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">交易/收据编号</dt>
            <dd className="mt-1 break-all font-medium text-slate-900">{repayment.transactionId}</dd>
          </div>
          <div>
            <dt className="text-slate-500">付款银行/渠道</dt>
            <dd className="mt-1 break-all font-medium text-slate-900">{repayment.payerBank}</dd>
          </div>
          <div>
            <dt className="text-slate-500">付款账号/来源</dt>
            <dd className="mt-1 break-all font-medium text-slate-900">{repayment.payerAccount}</dd>
          </div>
          <div>
            <dt className="text-slate-500">付款凭证</dt>
            <dd className="mt-1">
              {repayment.proof ? (
                <a
                  href={repayment.proof.accessUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-blue-600 hover:underline"
                >
                  {repayment.proof.fileName}
                </a>
              ) : (
                <span className="font-medium text-red-600">凭证缺失，请联系管理员</span>
              )}
            </dd>
          </div>
        </dl>
        <label className="block text-sm font-medium text-slate-700">
          本次付款金额
          <input
            type="number"
            min="0.0001"
            step="0.0001"
            inputMode="decimal"
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
        disabled={signing || !repayment.proof}
        className="w-full rounded-lg bg-blue-600 py-3 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
      >
        {signing ? "提交中..." : "确认已付款"}
      </button>
    </div>
  );
}
