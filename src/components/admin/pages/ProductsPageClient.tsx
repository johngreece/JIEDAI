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

export function ProductsPageClient() {
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

  useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setEditItem(null);
    setShowForm(true);
  }

  function openEdit(product: Product) {
    setEditItem(product);
    setShowForm(true);
  }

  async function toggleActive(product: Product) {
    await fetch(`/api/products/${product.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !product.isActive }),
    });
    await load();
  }

  return (
    <div className="space-y-6">
      <header className="panel-soft admin-page-header">
        <div className="admin-page-header__meta">
          <span className="admin-page-header__eyebrow">Products</span>
          <h1 className="admin-page-header__title">贷款产品</h1>
          <p className="admin-page-header__description">统一维护产品规则、额度范围、期限、还款方式和展期能力。</p>
        </div>
        <div className="admin-toolbar-group">
          <button onClick={load} className="admin-btn admin-btn-secondary">刷新</button>
          <button onClick={openCreate} className="admin-btn admin-btn-primary">新增产品</button>
        </div>
      </header>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {showForm ? <ProductForm item={editItem} onClose={() => setShowForm(false)} onSaved={load} /> : null}

      <section className="table-shell admin-table-shell">
        <div className="admin-table-toolbar">
          <div>
            <div className="admin-table-title">产品列表</div>
            <p className="admin-table-note">查看当前可用产品的额度区间、期限规则与状态。</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
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
              ) : (
                items.map((product) => (
                  <tr key={product.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{product.name}</td>
                    <td className="px-4 py-3 text-slate-500">{product.code}</td>
                    <td className="px-4 py-3 text-slate-700">{product.minAmount.toLocaleString()} ~ {product.maxAmount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-700">{product.minTermValue} ~ {product.maxTermValue} {product.termUnit === "MONTH" ? "月" : "天"}</td>
                    <td className="px-4 py-3 text-slate-500">{REPAY_METHODS[product.repaymentMethod] ?? product.repaymentMethod}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${product.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                        {product.isActive ? "启用" : "停用"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="admin-btn-group">
                        <button onClick={() => openEdit(product)} className="text-blue-600 hover:underline">编辑</button>
                        <button onClick={() => toggleActive(product)} className="text-slate-500 hover:underline">
                          {product.isActive ? "停用" : "启用"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

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

  function setField(key: string, value: unknown) {
    setForm((current) => ({ ...current, [key]: value }));
  }

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
      await onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-form-shell">
      <div className="admin-section-card__header -mx-5 -mt-5 mb-5 border-b border-slate-100 px-5">
        <div>
          <div className="admin-section-card__title">{isEdit ? "编辑产品" : "新增产品"}</div>
          <p className="admin-section-card__description">统一配置产品额度、期限和扩展能力，便于后续风控与放款复用。</p>
        </div>
      </div>

      {err ? <p className="mb-4 text-sm text-red-600">{err}</p> : null}

      <div className="admin-form-grid md:grid-cols-2">
        <Field label="产品名称" value={form.name} onChange={(value) => setField("name", value)} />
        <Field label="产品编码" value={form.code} onChange={(value) => setField("code", value)} disabled={isEdit} />
        <Field label="最小金额" type="number" value={String(form.minAmount)} onChange={(value) => setField("minAmount", Number(value))} />
        <Field label="最大金额" type="number" value={String(form.maxAmount)} onChange={(value) => setField("maxAmount", Number(value))} />
        <Field label="最小期限" type="number" value={String(form.minTermValue)} onChange={(value) => setField("minTermValue", Number(value))} />
        <Field label="最大期限" type="number" value={String(form.maxTermValue)} onChange={(value) => setField("maxTermValue", Number(value))} />
        <SelectField label="期限单位" value={form.termUnit} onChange={(value) => setField("termUnit", value)} options={[{ value: "MONTH", label: "月" }, { value: "DAY", label: "天" }]} />
        <SelectField label="还款方式" value={form.repaymentMethod} onChange={(value) => setField("repaymentMethod", value)} options={[
          { value: "EQUAL_INSTALLMENT", label: "等额本息" },
          { value: "EQUAL_PRINCIPAL", label: "等额本金" },
          { value: "ONE_TIME", label: "一次性还本付息" },
        ]} />
      </div>

      <label className="mt-4 block text-sm">
        <span className="mb-1 block font-medium text-slate-700">描述</span>
        <textarea className="admin-field min-h-[96px]" rows={3} value={form.description} onChange={(e) => setField("description", e.target.value)} />
      </label>

      <div className="mt-4 admin-btn-group">
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={form.allowEarlyRepay} onChange={(e) => setField("allowEarlyRepay", e.target.checked)} />
          允许提前还款
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={form.allowExtension} onChange={(e) => setField("allowExtension", e.target.checked)} />
          允许展期
        </label>
        <div className="w-full md:w-[220px]">
          <Field label="最大展期次数" type="number" value={String(form.maxExtensionTimes)} onChange={(value) => setField("maxExtensionTimes", Number(value))} />
        </div>
      </div>

      <div className="mt-5 admin-btn-group">
        <button onClick={submit} disabled={saving} className="admin-btn admin-btn-primary">{saving ? "保存中..." : "保存"}</button>
        <button onClick={onClose} className="admin-btn admin-btn-secondary">取消</button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", disabled = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <input type={type} disabled={disabled} className="admin-field" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <select className="admin-field" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
