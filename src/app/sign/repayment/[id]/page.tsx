"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SignCanvas } from "@/components/SignCanvas";

export default function RepaymentSignPage() {
  const params = useParams();
  const id = params.id as string;
  const [repayment, setRepayment] = useState<{ repaymentNo: string; amount: string; status: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signing, setSigning] = useState(false);
  const [canvasData, setCanvasData] = useState<string | null>(null);
  const [confirmedAmount, setConfirmedAmount] = useState("");
  const [confirmedUsage, setConfirmedUsage] = useState("");

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
    if (!canvasData) {
      setError("请先在手写区签字");
      return;
    }
    if (!confirmedAmount) {
      setError("请确认还款金额");
      return;
    }
    setSigning(true);
    setError("");
    fetch(`/api/client/repayments/${id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        result: "confirmed",
        confirmedAmount: confirmedAmount,
        confirmedUsage: confirmedUsage || undefined,
        signImageUrl: canvasData,
        signData: { type: "canvas_base64" },
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setRepayment((r) => r ? { ...r, status: "confirmed" } : null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setSigning(false));
  }

  if (loading) return <div className="min-h-screen p-6 flex items-center justify-center">加载中…</div>;
  if (error && !repayment) return <div className="min-h-screen p-6 text-red-600">{error}</div>;
  if (!repayment) return null;

  if (repayment.status === "confirmed") {
    return (
      <div className="min-h-screen p-6 flex flex-col items-center justify-center">
        <p className="text-green-600 font-medium mb-4">还款已确认</p>
        <Link href="/dashboard" className="text-blue-600 hover:underline">返回工作台</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <Link href="/dashboard" className="text-sm text-slate-500 hover:underline">返回</Link>
        <span className="text-sm text-slate-600">还款单号：{repayment.repaymentNo}</span>
      </div>
      <div className="rounded-lg border bg-white p-4 mb-4">
        <p className="text-sm text-slate-600 mb-2">还款金额：{repayment.amount}</p>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">确认金额 *</label>
          <input
            value={confirmedAmount}
            onChange={(e) => setConfirmedAmount(e.target.value)}
            className="input-base mb-4"
            placeholder="与本次还款金额一致"
          />
          <label className="block text-sm font-medium text-slate-700 mb-1">用途说明（可选）</label>
          <input
            value={confirmedUsage}
            onChange={(e) => setConfirmedUsage(e.target.value)}
            className="input-base"
            placeholder="如：归还某笔借款第1期"
          />
        </div>
      </div>
      <div className="rounded-lg border bg-white p-4 mb-4">
        <p className="text-sm font-medium text-slate-700 mb-2">手写签字（确认本次还款）</p>
        <SignCanvas onDataUrl={setCanvasData} />
      </div>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      <button
        type="button"
        onClick={handleSign}
        disabled={signing}
        className="w-full rounded-lg bg-slate-800 text-white py-3 font-medium hover:bg-slate-700 disabled:opacity-50"
      >
        {signing ? "提交中…" : "确认还款"}
      </button>
    </div>
  );
}
