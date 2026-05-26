"use client";

import { useCallback, useEffect, useState } from "react";

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

type PricingRule = {
  id: string;
  productId: string;
  name: string;
  ruleType: string;
  rateType: "FIXED" | "PERCENTAGE";
  rateValue: number;
  minValue: number | null;
  maxValue: number | null;
  conditionJson: string | null;
  priority: number;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  version: number;
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
  const [pricingProduct, setPricingProduct] = useState<Product | null>(null);

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
      {pricingProduct ? <PricingRulesPanel product={pricingProduct} onClose={() => setPricingProduct(null)} /> : null}

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
                        <button onClick={() => setPricingProduct(product)} className="text-indigo-600 hover:underline">定价规则</button>
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

const RULE_TYPE_OPTIONS = [
  { value: "CHANNEL", label: "通道" },
  { value: "TIER_RATE", label: "还款阶梯" },
  { value: "UPFRONT_FEE", label: "砍头息手续费" },
  { value: "OVERDUE_PHASE1", label: "逾期阶段1" },
  { value: "OVERDUE_PHASE2", label: "逾期阶段2" },
  { value: "OVERDUE_PHASE3", label: "逾期阶段3" },
  { value: "OVERDUE_GRACE", label: "逾期宽限" },
];

const RULE_TEMPLATES = [
  {
    label: "全额到账",
    name: "通道类型",
    ruleType: "CHANNEL",
    rateValue: 0,
    priority: 99,
    conditionJson: { type: "FULL_AMOUNT" },
  },
  {
    label: "当晚2%",
    name: "当晚还款",
    ruleType: "TIER_RATE",
    rateValue: 2,
    priority: 10,
    conditionJson: { maxHours: 5, maxDays: 0, windowType: "SAME_NIGHT", nightCutoffHour: 5, label: "当晚还款（含次日凌晨）" },
  },
  {
    label: "次日3%",
    name: "次日还款",
    ruleType: "TIER_RATE",
    rateValue: 3,
    priority: 9,
    conditionJson: { maxHours: 24, maxDays: 1, windowType: "NEXT_CALENDAR_DAY", label: "次日下午/晚上还款" },
  },
  {
    label: "7天5%",
    name: "第7天同一时间前还款",
    ruleType: "TIER_RATE",
    rateValue: 5,
    priority: 7,
    conditionJson: { maxHours: 168, maxDays: 7, label: "第7天同一时间前还款" },
  },
  {
    label: "逾期2%",
    name: "逾期阶段1",
    ruleType: "OVERDUE_PHASE1",
    rateValue: 2,
    priority: 5,
    conditionJson: { startDay: 1, maxOverdueDay: 7, compound: true, label: "逾期第1-7天" },
  },
];

function toDateTimeInput(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function describeCondition(rule: PricingRule) {
  if (!rule.conditionJson) return "-";
  try {
    const cond = JSON.parse(rule.conditionJson) as Record<string, unknown>;
    if (rule.ruleType === "CHANNEL") return String(cond.type ?? "-");
    if (rule.ruleType === "TIER_RATE") {
      const window = cond.windowType ? ` · ${String(cond.windowType)}` : "";
      const cutoff = cond.nightCutoffHour != null ? ` · 截止${String(cond.nightCutoffHour)}点` : "";
      return `${String(cond.label ?? "") || `${String(cond.maxHours ?? cond.maxDays ?? "-")}小时/天`}${window}${cutoff}`;
    }
    if (rule.ruleType.startsWith("OVERDUE_PHASE")) {
      return `${String(cond.startDay ?? 1)}-${String(cond.maxOverdueDay ?? cond.maxDays ?? "∞")}天 · ${cond.compound === false ? "单利" : "复利"}`;
    }
    return rule.conditionJson.length > 80 ? `${rule.conditionJson.slice(0, 80)}...` : rule.conditionJson;
  } catch {
    return "JSON异常";
  }
}

function formatConditionForEdit(conditionJson: string | null) {
  if (!conditionJson) return "";
  try {
    return prettyJson(JSON.parse(conditionJson));
  } catch {
    return conditionJson;
  }
}

function PricingRulesPanel({ product, onClose }: { product: Product; onClose: () => void }) {
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editRule, setEditRule] = useState<PricingRule | null>(null);
  const [form, setForm] = useState({
    name: "当晚还款",
    ruleType: "TIER_RATE",
    rateType: "PERCENTAGE" as "FIXED" | "PERCENTAGE",
    rateValue: 2,
    priority: 10,
    conditionJson: prettyJson({ maxHours: 5, maxDays: 0, windowType: "SAME_NIGHT", nightCutoffHour: 5, label: "当晚还款（含次日凌晨）" }),
    effectiveFrom: toDateTimeInput(),
    effectiveTo: "",
  });

  const loadRules = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/products/${product.id}/pricing-rules?includeInactive=true`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "加载定价规则失败");
      setRules(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载定价规则失败");
    } finally {
      setLoading(false);
    }
  }, [product.id]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  function setField(key: string, value: unknown) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function applyTemplate(template: (typeof RULE_TEMPLATES)[number]) {
    setEditRule(null);
    setForm({
      name: template.name,
      ruleType: template.ruleType,
      rateType: "PERCENTAGE",
      rateValue: template.rateValue,
      priority: template.priority,
      conditionJson: prettyJson(template.conditionJson),
      effectiveFrom: toDateTimeInput(),
      effectiveTo: "",
    });
  }

  function openEditRule(rule: PricingRule) {
    setEditRule(rule);
    setForm({
      name: rule.name,
      ruleType: rule.ruleType,
      rateType: rule.rateType,
      rateValue: rule.rateValue,
      priority: rule.priority,
      conditionJson: formatConditionForEdit(rule.conditionJson),
      effectiveFrom: toDateTimeInput(rule.effectiveFrom),
      effectiveTo: rule.effectiveTo ? toDateTimeInput(rule.effectiveTo) : "",
    });
  }

  async function saveRule() {
    setSaving(true);
    setError("");
    try {
      const url = editRule
        ? `/api/products/${product.id}/pricing-rules/${editRule.id}`
        : `/api/products/${product.id}/pricing-rules`;
      const res = await fetch(url, {
        method: editRule ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          ruleType: form.ruleType,
          rateType: form.rateType,
          rateValue: Number(form.rateValue),
          priority: Number(form.priority),
          ...(form.conditionJson.trim() || editRule ? { conditionJson: form.conditionJson.trim() || null } : {}),
          effectiveFrom: new Date(form.effectiveFrom).toISOString(),
          ...(form.effectiveTo || editRule ? { effectiveTo: form.effectiveTo ? new Date(form.effectiveTo).toISOString() : null } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存定价规则失败");
      setEditRule(null);
      await loadRules();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存定价规则失败");
    } finally {
      setSaving(false);
    }
  }

  async function deactivateRule(rule: PricingRule) {
    if (!confirm(`确认停用定价规则「${rule.name}」？`)) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/products/${product.id}/pricing-rules/${rule.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "停用定价规则失败");
      await loadRules();
    } catch (e) {
      setError(e instanceof Error ? e.message : "停用定价规则失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-form-shell">
      <div className="admin-section-card__header -mx-5 -mt-5 mb-5 border-b border-slate-100 px-5">
        <div>
          <div className="admin-section-card__title">{product.name} · 定价规则</div>
          <p className="admin-section-card__description">维护通道、当晚/次日/7天还款阶梯和逾期阶段。</p>
        </div>
        <button onClick={onClose} className="admin-btn admin-btn-secondary">关闭</button>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {RULE_TEMPLATES.map((template) => (
          <button key={template.label} type="button" onClick={() => applyTemplate(template)} className="admin-btn admin-btn-secondary">
            {template.label}
          </button>
        ))}
      </div>

      <div className="admin-form-grid md:grid-cols-4">
        <Field label="规则名称" value={form.name} onChange={(value) => setField("name", value)} />
        <SelectField label="规则类型" value={form.ruleType} onChange={(value) => setField("ruleType", value)} options={RULE_TYPE_OPTIONS} />
        <SelectField label="费率类型" value={form.rateType} onChange={(value) => setField("rateType", value)} options={[
          { value: "PERCENTAGE", label: "百分比" },
          { value: "FIXED", label: "固定金额" },
        ]} />
        <Field label="费率值" type="number" value={String(form.rateValue)} onChange={(value) => setField("rateValue", Number(value))} />
        <Field label="优先级" type="number" value={String(form.priority)} onChange={(value) => setField("priority", Number(value))} />
        <Field label="生效时间" type="datetime-local" value={form.effectiveFrom} onChange={(value) => setField("effectiveFrom", value)} />
        <Field label="失效时间" type="datetime-local" value={form.effectiveTo} onChange={(value) => setField("effectiveTo", value)} />
      </div>

      <label className="mt-4 block text-sm">
        <span className="mb-1 block font-medium text-slate-700">JSON 条件</span>
        <textarea
          className="admin-field min-h-[120px] font-mono text-xs"
          value={form.conditionJson}
          onChange={(e) => setField("conditionJson", e.target.value)}
        />
      </label>

      <div className="mt-4 admin-btn-group">
        <button onClick={saveRule} disabled={saving} className="admin-btn admin-btn-primary">{saving ? "保存中..." : editRule ? "保存修改" : "新增规则"}</button>
        {editRule ? <button onClick={() => setEditRule(null)} className="admin-btn admin-btn-secondary">取消编辑</button> : null}
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="px-4 py-3">规则</th>
              <th className="px-4 py-3">类型</th>
              <th className="px-4 py-3">费率</th>
              <th className="px-4 py-3">条件</th>
              <th className="px-4 py-3">优先级</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">加载中...</td></tr>
            ) : rules.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">暂无定价规则</td></tr>
            ) : (
              rules.map((rule) => (
                <tr key={rule.id} className={!rule.isActive ? "bg-slate-50 text-slate-400" : ""}>
                  <td className="px-4 py-3 font-medium text-slate-900">{rule.name}</td>
                  <td className="px-4 py-3 text-slate-600">{rule.ruleType}</td>
                  <td className="px-4 py-3 text-slate-700">{rule.rateValue}{rule.rateType === "PERCENTAGE" ? "%" : ""}</td>
                  <td className="max-w-[360px] px-4 py-3 text-slate-500">{describeCondition(rule)}</td>
                  <td className="px-4 py-3 text-slate-500">{rule.priority}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${rule.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-500"}`}>
                      {rule.isActive ? "启用" : "停用"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="admin-btn-group">
                      <button onClick={() => openEditRule(rule)} className="text-blue-600 hover:underline">编辑</button>
                      {rule.isActive ? (
                        <button onClick={() => deactivateRule(rule)} className="text-red-600 hover:underline">停用</button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
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
