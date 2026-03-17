"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SignCanvas } from "@/components/SignCanvas";

export default function ClientRepaymentSignPage() {
  const params = useParams();
  const id = params.id as string;
  const [repayment, setRepayment] = useState<{ repaymentNo: string; amount: number; status: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signing, setSigning] = useState(false);
  const [canvasData, setCanvasData] = useState<string | null>(null);
  const [confirmedAmount, setConfirmedAmount] = useState("");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/repayments/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setRepayment(data);
        setConfirmedAmount(String(data.amount ?? ""));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  function handleSign() {
    if (!canvasData) { setError("请先在手写区签字"); return; }
    if (!confirmedAmount) { setError("请确认还款金额"); return; }
    setSigning(true);
    setError("");
    fetch(`/api/client/repayments/${id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "CONFIRMED",
        signatureData: canvasData,
        deviceInfo: navigator.userAgent,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setRepayment((r) => r ? { ...r, status: "CONFIRMED" } : null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setSigning(false));
  }

  if (loading) return <div className="p-6 flex items-center justify-center">加载中…</div>;
  if (error && !repayment) return <div className="p-6 text-red-600">{error}</div>;
  if (!repayment) return null;

  if (repayment.status === "CONFIRMED") {
    return (
      <div className="p-6 flex flex-col items-center justify-center">
        <p className="text-green-600 font-medium mb-4">还款已确认</p>
        <Link href="/client/dashboard" className="text-blue-600 hover:underline">返回我的借款</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="panel-soft mb-4 flex items-center justify-between rounded-xl px-4 py-3">
        <Link href="/client/dashboard" className="text-sm text-slate-500 hover:underline">返回</Link>
        <span className="text-sm text-slate-600">还款单号：{repayment.repaymentNo}</span>
      </div>
      <div className="panel-soft mb-4 rounded-lg p-4">
        <p className="text-sm text-slate-600 mb-2">还款金额：{repayment.amount}</p>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">确认金额 *</label>
          <input value={confirmedAmount} onChange={(e) => setConfirmedAmount(e.target.value)} className="input-base" />
        </div>
      </div>
      <div className="panel-soft mb-4 rounded-lg p-4">
        <p className="text-sm font-medium text-slate-700 mb-2">手写签字（确认本次还款）</p>
        <SignCanvas onDataUrl={setCanvasData} />
      </div>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      <button
        type="button"
        onClick={handleSign}
        disabled={signing}
        className="w-full rounded-lg bg-blue-600 py-3 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
      >
        {signing ? "提交中…" : "确认还款"}
      </button>
    </div>
  );
}
