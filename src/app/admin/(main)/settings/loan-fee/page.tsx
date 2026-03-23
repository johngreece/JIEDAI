"use client";

import { useEffect, useState } from "react";

type FeeRates = {
  sameDayRate: number;
  nextDayRate: number;
  day3Day7Rate: number;
  otherDayRate: number;
  overdueGraceHours: number;
  overdueRatePerDayBefore14: number;
  overdueRatePerDayAfter14: number;
};

export default function AdminLoanFeeSettingsPage() {
  const [rates, setRates] = useState<FeeRates | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FeeRates | null>(null);

  useEffect(() => {
    fetch("/api/settings/loan-fee")
      .then((r) => {
        if (r.status === 403) throw new Error("仅管理员可查看");
        return r.json();
      })
      .then((data) => {
        setRates(data);
        setForm(data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);
    fetch("/api/settings/loan-fee", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(d.error || "保存失败"); });
        return r.json();
      })
      .then(setRates)
      .catch((e) => setError(e.message))
      .finally(() => setSaving(false));
  }

  if (loading) return <div className="p-6 text-slate-500">加载中…</div>;
  if (error && !form) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="p-6">
      <header className="panel-soft mb-6 rounded-2xl px-5 py-4">
        <h1 className="text-xl font-semibold">借款费率配置</h1>
        <p className="text-sm text-slate-500 mt-1">
          默认：放款后 5 小时内还 2%，放款后 24 小时内还 3%，超过 24 小时至 7 天内还 5%。到期后宽限 24 小时，超过后前 14 天按 1%/天，第 15 天起按 2%/天。
        </p>
      </header>
      {error && <div className="mb-4 text-red-600 text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="panel-soft max-w-md space-y-4 rounded-xl p-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">5 小时内还款费率（%）</label>
          <input type="number" step="0.01" min="0" value={form?.sameDayRate ?? ""} onChange={(e) => setForm((f) => f ? { ...f, sameDayRate: Number(e.target.value) } : null)} className="input-base" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">24 小时内还款费率（%）</label>
          <input type="number" step="0.01" min="0" value={form?.nextDayRate ?? ""} onChange={(e) => setForm((f) => f ? { ...f, nextDayRate: Number(e.target.value) } : null)} className="input-base" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">24 小时后至 7 天内还款费率（%）</label>
          <input type="number" step="0.01" min="0" value={form?.day3Day7Rate ?? ""} onChange={(e) => setForm((f) => f ? { ...f, day3Day7Rate: Number(e.target.value) } : null)} className="input-base" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">其他补充费率（%）</label>
          <input type="number" step="0.01" min="0" value={form?.otherDayRate ?? ""} onChange={(e) => setForm((f) => f ? { ...f, otherDayRate: Number(e.target.value) } : null)} className="input-base" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">逾期宽限小时数</label>
          <input type="number" min="0" value={form?.overdueGraceHours ?? ""} onChange={(e) => setForm((f) => f ? { ...f, overdueGraceHours: Number(e.target.value) } : null)} className="input-base" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">逾期 14 天内每日费率（%/天）</label>
          <input type="number" step="0.01" min="0" value={form?.overdueRatePerDayBefore14 ?? ""} onChange={(e) => setForm((f) => f ? { ...f, overdueRatePerDayBefore14: Number(e.target.value) } : null)} className="input-base" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">逾期 14 天以上每日费率（%/天）</label>
          <input type="number" step="0.01" min="0" value={form?.overdueRatePerDayAfter14 ?? ""} onChange={(e) => setForm((f) => f ? { ...f, overdueRatePerDayAfter14: Number(e.target.value) } : null)} className="input-base" />
        </div>
        <button type="submit" disabled={saving} className="btn-primary px-4 py-2 disabled:opacity-50">
          {saving ? "保存中…" : "保存"}
        </button>
      </form>
    </div>
  );
}
