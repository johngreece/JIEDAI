"use client";

import { useEffect, useState } from "react";

type Product = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  minAmount: number;
  maxAmount: number;
  minTermValue: number;
  maxTermValue: number;
  termUnit: string;
  repaymentMethod: string;
  allowEarlyRepay: boolean;
  allowExtension: boolean;
  maxExtensionTimes: number;
  isActive: boolean;
  createdAt: string;
};

const REPAY_METHODS: Record<string, string> = {
  ONE_TIME: "一次性还本付息",
  EQUAL_INSTALLMENT: "等额本息",
  EQUAL_PRINCIPAL: "等额本金",
};

export default function ProductsPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Product | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/products");
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

  function openCreate() { setEditItem(null); setShowForm(true); }
  function openEdit(p: Product) { setEditItem(p); setShowForm(true); }

  async function toggleActive(p: Product) {
    await fetch(`/api/products/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    load();
  }

  return (
    <div className="space-y-6">
      <header className="panel-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">贷款产品</h1>
          <p className="mt-1 text-sm text-slate-600">管理贷款产品及定价规则</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-soft rounded-lg px-3 py-2 text-sm">刷新</button>
          <button onClick={openCreate} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800">新增产品</button>
        </div>
      </header>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {showForm && <ProductForm item={editItem} onClose={() => setShowForm(false)} onSaved={load} />}

      <section className="table-shell overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-3">名称</th>
                <th className="px-4 py-3">编码</th>
                <th className="px-4 py-3">金额范围</th>
                <th className="px-4 py-3">期限</th>
                <th className="px-4 py-3">还款方式</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">加载中...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">暂无数据</td></tr>
              ) : items.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                  <td className="px-4 py-3 text-slate-500">{p.code}</td>
                  <td className="px-4 py-3 text-slate-700">{p.minAmount.toLocaleString()} ~ {p.maxAmount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-700">{p.minTermValue}~{p.maxTermValue} {p.termUnit === "MONTH" ? "月" : "天"}</td>
                  <td className="px-4 py-3 text-slate-500">{REPAY_METHODS[p.repaymentMethod] ?? p.repaymentMethod}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${p.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                      {p.isActive ? "启用" : "停用"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(p)} className="text-blue-600 hover:underline">编辑</button>
                      <button onClick={() => toggleActive(p)} className="text-slate-500 hover:underline">
                        {p.isActive ? "停用" : "启用"}
                      </button>
                    </div>
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

/* ---------- Form Component ---------- */
function ProductForm({ item, onClose, onSaved }: { item: Product | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    name: item?.name ?? "",
    code: item?.code ?? "",
    description: item?.description ?? "",
    minAmount: item?.minAmount ?? 1000,
    maxAmount: item?.maxAmount ?? 100000,
    minTermValue: item?.minTermValue ?? 1,
    maxTermValue: item?.maxTermValue ?? 12,
    termUnit: item?.termUnit ?? "MONTH",
    repaymentMethod: item?.repaymentMethod ?? "EQUAL_INSTALLMENT",
    allowEarlyRepay: item?.allowEarlyRepay ?? true,
    allowExtension: item?.allowExtension ?? false,
    maxExtensionTimes: item?.maxExtensionTimes ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function set(key: string, val: unknown) { setForm((f) => ({ ...f, [key]: val })); }

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const url = isEdit ? `/api/products/${item!.id}` : "/api/products";
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
      <h2 className="text-lg font-semibold text-slate-900">{isEdit ? "编辑产品" : "新增产品"}</h2>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block"><span className="text-sm text-slate-600">产品名称</span>
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label className="block"><span className="text-sm text-slate-600">产品编码</span>
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.code} onChange={(e) => set("code", e.target.value)} disabled={isEdit} /></label>
        <label className="block"><span className="text-sm text-slate-600">最小金额</span>
          <input type="number" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.minAmount} onChange={(e) => set("minAmount", Number(e.target.value))} /></label>
        <label className="block"><span className="text-sm text-slate-600">最大金额</span>
          <input type="number" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.maxAmount} onChange={(e) => set("maxAmount", Number(e.target.value))} /></label>
        <label className="block"><span className="text-sm text-slate-600">最小期限</span>
          <input type="number" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.minTermValue} onChange={(e) => set("minTermValue", Number(e.target.value))} /></label>
        <label className="block"><span className="text-sm text-slate-600">最大期限</span>
          <input type="number" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.maxTermValue} onChange={(e) => set("maxTermValue", Number(e.target.value))} /></label>
        <label className="block"><span className="text-sm text-slate-600">期限单位</span>
          <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.termUnit} onChange={(e) => set("termUnit", e.target.value)}>
            <option value="MONTH">月</option><option value="DAY">天</option>
          </select></label>
        <label className="block"><span className="text-sm text-slate-600">还款方式</span>
          <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.repaymentMethod} onChange={(e) => set("repaymentMethod", e.target.value)}>
            <option value="EQUAL_INSTALLMENT">等额本息</option><option value="EQUAL_PRINCIPAL">等额本金</option><option value="ONE_TIME">一次性还本付息</option>
          </select></label>
      </div>
      <label className="block"><span className="text-sm text-slate-600">描述</span>
        <textarea className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} /></label>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.allowEarlyRepay} onChange={(e) => set("allowEarlyRepay", e.target.checked)} /> 允许提前还款</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.allowExtension} onChange={(e) => set("allowExtension", e.target.checked)} /> 允许展期</label>
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={submit} disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50">{saving ? "保存中..." : "保存"}</button>
        <button onClick={onClose} className="btn-soft rounded-lg px-4 py-2 text-sm">取消</button>
      </div>
    </div>
  );
}
