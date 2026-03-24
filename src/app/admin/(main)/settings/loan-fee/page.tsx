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
    <div className="space-y-6 p-6">
      <header className="panel-soft admin-page-header">
        <div className="admin-page-header__meta">
          <span className="admin-page-header__eyebrow">Loan Fee Settings</span>
          <h1 className="admin-page-header__title">借款费率配置</h1>
          <p className="admin-page-header__description">
            统一维护砍头息、全额到账阶梯费率、逾期日息与商业借款月息，确保前后端口径一致。
          </p>
        </div>
      </header>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
        <form onSubmit={handleSubmit} className="admin-form-shell">
          <div className="admin-section-card__header -mx-5 -mt-5 mb-5 border-b border-slate-100 px-5">
            <div>
              <div className="admin-section-card__title">费率参数</div>
              <p className="admin-section-card__description">修改后会直接影响借款规则展示、利息计算和逾期计息逻辑。</p>
            </div>
          </div>

          <div className="admin-form-grid md:grid-cols-2">
            <Field label="砍头息固定费率 (%)" value={form.upfrontFlatRate} onChange={(value) => updateField("upfrontFlatRate", value)} />
            <Field label="全额到账 5 小时内 (%)" value={form.fee5hRate} onChange={(value) => updateField("fee5hRate", value)} />
            <Field label="全额到账 24 小时内 (%)" value={form.fee24hRate} onChange={(value) => updateField("fee24hRate", value)} />
            <Field label="全额到账 48 小时内 (%)" value={form.fee48hRate} onChange={(value) => updateField("fee48hRate", value)} />
            <Field label="全额到账 7 天内 (%)" value={form.fee7dRate} onChange={(value) => updateField("fee7dRate", value)} />
            <Field label="逾期起算延迟 (小时)" value={form.overdueGraceHours} onChange={(value) => updateField("overdueGraceHours", value)} step="1" />
            <Field label="逾期第 1-7 天 (%/天)" value={form.overdueRatePerDayBefore7} onChange={(value) => updateField("overdueRatePerDayBefore7", value)} />
            <Field label="逾期第 8-30 天 (%/天)" value={form.overdueRatePerDayBefore30} onChange={(value) => updateField("overdueRatePerDayBefore30", value)} />
            <Field label="逾期第 31 天起 (%/天)" value={form.overdueRatePerDayAfter30} onChange={(value) => updateField("overdueRatePerDayAfter30", value)} />
            <Field label="商业借款月息 (%)" value={form.commercialMonthlyRate} onChange={(value) => updateField("commercialMonthlyRate", value)} />
          </div>

          <div className="mt-5">
            <button type="submit" disabled={saving} className="admin-btn admin-btn-primary">
              {saving ? "保存中..." : "保存配置"}
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="admin-section-card">
            <div className="admin-section-card__header">
              <div>
                <div className="admin-section-card__title">当前规则口径</div>
                <p className="admin-section-card__description">这里是后台修改时必须同步确认的统一业务规则。</p>
              </div>
            </div>
            <div className="admin-section-card__body space-y-3">
              <div className="admin-note-block">
                <div className="admin-note-block__label">砍头息模式</div>
                <p className="admin-note-block__text">固定扣 5%，一周内任何时间还款都按固定费率结算。</p>
              </div>
              <div className="admin-note-block">
                <div className="admin-note-block__label">全额到账模式</div>
                <p className="admin-note-block__text">5 小时内 2%，24 小时内 3%，48 小时内 4%，7 天内 6%。</p>
              </div>
              <div className="admin-note-block">
                <div className="admin-note-block__label">逾期规则</div>
                <p className="admin-note-block__text">1-7 天按 1%/天，8-30 天按 2%/天，31 天起按 3%/天，并按复利滚动。</p>
              </div>
              <div className="admin-note-block">
                <div className="admin-note-block__label">商业借款</div>
                <p className="admin-note-block__text">月息 10%，需提前申请、律师签署协议、公证盖章，并提供商业或房产担保。</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
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
        className="admin-field"
      />
    </label>
  );
}
