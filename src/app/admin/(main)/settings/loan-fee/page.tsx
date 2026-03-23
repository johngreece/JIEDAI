"use client";

import { useEffect, useState } from "react";

type FeeRates = {
  upfrontFlatRate: number;
  fee5hRate: number;
  fee24hRate: number;
  fee48hRate: number;
  fee7dRate: number;
  overdueGraceHours: number;
  overdueRatePerDayBefore7: number;
  overdueRatePerDayBefore30: number;
  overdueRatePerDayAfter30: number;
  commercialMonthlyRate: number;
};

export default function AdminLoanFeeSettingsPage() {
  const [form, setForm] = useState<FeeRates | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/loan-fee")
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "加载费率配置失败");
        setForm(data);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "加载费率配置失败"))
      .finally(() => setLoading(false));
  }, []);

  function updateField<K extends keyof FeeRates>(key: K, value: number) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/settings/loan-fee", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "保存失败");
      setForm(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6 text-slate-500">加载中...</div>;
  if (!form) return <div className="p-6 text-red-600">{error ?? "费率配置加载失败"}</div>;

  return (
    <div className="p-6">
      <header className="panel-soft mb-6 rounded-2xl px-5 py-4">
        <h1 className="text-xl font-semibold">借款费率配置</h1>
        <p className="mt-1 text-sm text-slate-500">
          当前统一口径：砍头息固定 5%，全额到账为 5 小时 2%、24 小时 3%、48 小时 4%、7 天内 6%；借款到期即进入逾期计算，逾期按日复利滚动，第 1-7 天 1%/天，第 8-30 天 2%/天，第 31 天起 3%/天。
        </p>
      </header>

      {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <form onSubmit={handleSubmit} className="panel-soft max-w-2xl space-y-4 rounded-xl p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="砍头息固定费率（%）" value={form.upfrontFlatRate} onChange={(value) => updateField("upfrontFlatRate", value)} />
          <Field label="全额到账 5 小时内（%）" value={form.fee5hRate} onChange={(value) => updateField("fee5hRate", value)} />
          <Field label="全额到账 24 小时内（%）" value={form.fee24hRate} onChange={(value) => updateField("fee24hRate", value)} />
          <Field label="全额到账 48 小时内（%）" value={form.fee48hRate} onChange={(value) => updateField("fee48hRate", value)} />
          <Field label="全额到账 7 天内（%）" value={form.fee7dRate} onChange={(value) => updateField("fee7dRate", value)} />
          <Field label="逾期起算延迟（小时）" value={form.overdueGraceHours} onChange={(value) => updateField("overdueGraceHours", value)} step="1" />
          <Field label="逾期第 1-7 天（%/天）" value={form.overdueRatePerDayBefore7} onChange={(value) => updateField("overdueRatePerDayBefore7", value)} />
          <Field label="逾期第 8-30 天（%/天）" value={form.overdueRatePerDayBefore30} onChange={(value) => updateField("overdueRatePerDayBefore30", value)} />
          <Field label="逾期第 31 天起（%/天）" value={form.overdueRatePerDayAfter30} onChange={(value) => updateField("overdueRatePerDayAfter30", value)} />
          <Field label="商业借款月息（%）" value={form.commercialMonthlyRate} onChange={(value) => updateField("commercialMonthlyRate", value)} />
        </div>

        <button type="submit" disabled={saving} className="btn-primary px-4 py-2 disabled:opacity-50">
          {saving ? "保存中..." : "保存"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step = "0.01",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <input
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="input-base"
      />
    </label>
  );
}
