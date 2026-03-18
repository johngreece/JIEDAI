"use client";

import { useEffect, useState } from "react";

type Funder = {
  id: string;
  name: string;
  type: string;
  contactPerson: string | null;
  contactPhone: string | null;
  profitShareRatio: number | null;
  isActive: boolean;
  accountCount: number;
  createdAt: string;
};

const TYPE_MAP: Record<string, string> = { INDIVIDUAL: "个人", COMPANY: "企业", PLATFORM: "平台" };

export default function FundersPage() {
  const [items, setItems] = useState<Funder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Funder | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/funders");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "加载失败");
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <header className="panel-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">资金方管理</h1>
          <p className="mt-1 text-sm text-slate-600">管理资金方与资金账户</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-soft rounded-lg px-3 py-2 text-sm">刷新</button>
          <button onClick={() => { setEditItem(null); setShowForm(true); }} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800">新增资金方</button>
        </div>
      </header>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {showForm && <FunderForm item={editItem} onClose={() => setShowForm(false)} onSaved={load} />}

      <section className="table-shell overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-3">名称</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">联系人</th>
                <th className="px-4 py-3">分润比例</th>
                <th className="px-4 py-3">账户数</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">加载中...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">暂无数据</td></tr>
              ) : items.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-slate-900">{f.name}</td>
                  <td className="px-4 py-3 text-slate-500">{TYPE_MAP[f.type] ?? f.type}</td>
                  <td className="px-4 py-3 text-slate-700">{f.contactPerson ?? "-"}{f.contactPhone ? ` (${f.contactPhone})` : ""}</td>
                  <td className="px-4 py-3 text-slate-700">{f.profitShareRatio != null ? `${(f.profitShareRatio * 100).toFixed(1)}%` : "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{f.accountCount}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${f.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                      {f.isActive ? "启用" : "停用"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => { setEditItem(f); setShowForm(true); }} className="text-blue-600 hover:underline text-sm">编辑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function FunderForm({ item, onClose, onSaved }: { item: Funder | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    name: item?.name ?? "",
    type: item?.type ?? "INDIVIDUAL",
    contactPerson: item?.contactPerson ?? "",
    contactPhone: item?.contactPhone ?? "",
    profitShareRatio: item?.profitShareRatio ?? 0,
    remark: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const url = isEdit ? `/api/funders/${item!.id}` : "/api/funders";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存失败");
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel-soft rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">{isEdit ? "编辑资金方" : "新增资金方"}</h2>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block"><span className="text-sm text-slate-600">名称</span>
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="block"><span className="text-sm text-slate-600">类型</span>
          <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="INDIVIDUAL">个人</option><option value="COMPANY">企业</option><option value="PLATFORM">平台</option>
          </select></label>
        <label className="block"><span className="text-sm text-slate-600">联系人</span>
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></label>
        <label className="block"><span className="text-sm text-slate-600">联系电话</span>
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} /></label>
        <label className="block"><span className="text-sm text-slate-600">分润比例 (0~1)</span>
          <input type="number" step="0.01" min="0" max="1" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.profitShareRatio} onChange={(e) => setForm({ ...form, profitShareRatio: Number(e.target.value) })} /></label>
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={submit} disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50">{saving ? "保存中..." : "保存"}</button>
        <button onClick={onClose} className="btn-soft rounded-lg px-4 py-2 text-sm">取消</button>
      </div>
    </div>
  );
}
