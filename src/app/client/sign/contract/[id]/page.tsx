"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SignCanvas } from "@/components/SignCanvas";

export default function ClientContractSignPage() {
  const params = useParams();
  const id = params.id as string;
  const [contract, setContract] = useState<{ contractNo: string; content: string; status: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signing, setSigning] = useState(false);
  const [canvasData, setCanvasData] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/contracts/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setContract(data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  function handleSign() {
    if (!canvasData) {
      setError("请先在手写区签字");
      return;
    }
    setSigning(true);
    setError("");
    fetch(`/api/contracts/${id}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signatureData: canvasData,
        signerType: "customer",
        signerName: "",
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setContract((c) => c ? { ...c, status: "SIGNED" } : null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setSigning(false));
  }

  if (loading) return <div className="p-6 flex items-center justify-center">加载中…</div>;
  if (error && !contract) return <div className="p-6 text-red-600">{error}</div>;
  if (!contract) return null;

  if (contract.status === "SIGNED") {
    return (
      <div className="p-6 flex flex-col items-center justify-center">
        <p className="text-green-600 font-medium mb-4">合同已签署</p>
        <Link href="/client/dashboard" className="text-blue-600 hover:underline">返回我的借款</Link>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <Link href="/client/dashboard" className="text-sm text-slate-500 hover:underline">返回</Link>
        <span className="text-sm text-slate-600">合同号：{contract.contractNo}</span>
      </div>
      <div className="rounded-lg border bg-white p-4 mb-4 max-h-[40vh] overflow-auto">
        <div dangerouslySetInnerHTML={{ __html: contract.content || "" }} className="prose prose-sm max-w-none" />
      </div>
      <div className="rounded-lg border bg-white p-4 mb-4">
        <p className="text-sm font-medium text-slate-700 mb-2">手写签字（请在下框内签名）</p>
        <SignCanvas onDataUrl={setCanvasData} />
      </div>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      <button
        type="button"
        onClick={handleSign}
        disabled={signing}
        className="w-full rounded-lg bg-blue-600 text-white py-3 font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {signing ? "提交中…" : "确认签署"}
      </button>
    </div>
  );
}
