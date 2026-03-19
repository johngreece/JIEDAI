"use client";

import { useEffect, useState } from "react";

interface FunderContract {
  id: string;
  cooperationMode: string;
  title: string;
  content: string;
  status: string;
  signedAt: string | null;
  generatedBy: string | null;
  createdAt: string;
}

const MODE_MAP: Record<string, string> = { FIXED_MONTHLY: "固定月息", VOLUME_BASED: "业务量结算" };
const STATUS_MAP: Record<string, string> = { DRAFT: "草稿", ACTIVE: "生效中", EXPIRED: "已过期" };
const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  ACTIVE: "bg-emerald-100 text-emerald-700",
  EXPIRED: "bg-red-100 text-red-600",
};

export default function ContractsPage() {
  const [contracts, setContracts] = useState<FunderContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [detail, setDetail] = useState<FunderContract | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/funder/contracts");
      const data = await res.json();
      setContracts(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/funder/contracts", { method: "POST" });
      if (res.ok) load();
    } catch { /* ignore */ }
    setGenerating(false);
  }

  useEffect(() => { load(); }, []);

  if (detail) {
    return (
      <div className="space-y-4">
        <button onClick={() => setDetail(null)} className="text-sm text-emerald-600 hover:underline">← 返回合同列表</button>
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-1">{detail.title}</h2>
          <div className="flex gap-3 text-xs text-slate-400 mb-4">
            <span>{MODE_MAP[detail.cooperationMode] ?? detail.cooperationMode}</span>
            <span>·</span>
            <span className={`rounded-full px-2 py-0.5 ${STATUS_BADGE[detail.status] ?? ""}`}>{STATUS_MAP[detail.status] ?? detail.status}</span>
            <span>·</span>
            <span>生成于 {new Date(detail.createdAt).toLocaleDateString("zh-CN")}</span>
          </div>
          <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700 leading-relaxed font-sans">{detail.content}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">合作协议</h1>
          <p className="text-sm text-slate-500">查看系统自动生成的合作协议</p>
        </div>
        <button onClick={generate} disabled={generating} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">
          {generating ? "生成中..." : "生成新合同"}
        </button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        </div>
      ) : contracts.length === 0 ? (
        <div className="py-12 text-center text-slate-400">暂无合同，点击"生成新合同"创建</div>
      ) : (
        <div className="space-y-3">
          {contracts.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 hover:shadow-sm transition-shadow cursor-pointer" onClick={() => setDetail(c)}>
              <div>
                <div className="font-medium text-slate-900">{c.title}</div>
                <div className="flex gap-3 mt-1 text-xs text-slate-400">
                  <span>{MODE_MAP[c.cooperationMode] ?? c.cooperationMode}</span>
                  <span>{new Date(c.createdAt).toLocaleDateString("zh-CN")}</span>
                  {c.generatedBy && <span>由 {c.generatedBy}</span>}
                </div>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[c.status] ?? "bg-slate-100 text-slate-600"}`}>
                {STATUS_MAP[c.status] ?? c.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
