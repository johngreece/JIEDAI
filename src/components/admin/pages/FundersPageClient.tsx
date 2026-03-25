"use client";

import { useCallback, useEffect, useState } from "react";

import type { FunderPrefetchItem } from "@/lib/admin-prefetch";

type FundAccount = {
  id: string;
  accountName: string;
  bankName: string;
  accountNo: string;
  balance: number;
  totalInflow?: number;
  totalOutflow?: number;
  totalProfit?: number;
};

type CapitalInflow = {
  id: string;
  amount: number;
  channel: string;
  inflowDate: string;
  status: string;
  remark: string | null;
};

const TYPE_MAP: Record<string, string> = {
  INDIVIDUAL: "个人",
  COMPANY: "企业",
  PLATFORM: "平台",
};

const MODE_MAP: Record<string, string> = {
  FIXED_MONTHLY: "固定月息",
  VOLUME_BASED: "业务量结算",
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

type FundersPageClientProps = {
  initialItems: FunderPrefetchItem[];
};

export function FundersPageClient({ initialItems }: FundersPageClientProps) {
  const [items, setItems] = useState<FunderPrefetchItem[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<FunderPrefetchItem | null>(null);
  const [accountTarget, setAccountTarget] = useState<FunderPrefetchItem | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/funders");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "加载失败");
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function removeFunder(item: FunderPrefetchItem) {
    if (!window.confirm(`确认删除资金方“${item.name}”吗？已有历史的账户会自动停用。`)) return;
    try {
      const res = await fetch(`/api/funders/${item.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "删除失败");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  }

  return (
    <div className="space-y-6">
      <header className="panel-soft admin-page-header">
        <div className="admin-page-header__meta">
          <span className="admin-page-header__eyebrow">Funders</span>
          <h1 className="admin-page-header__title">资金方管理</h1>
          <p className="admin-page-header__description">
            系统管理员可新增、编辑、删除资金方，并统一管理资金账户和资金池注资。
          </p>
        </div>
        <div className="admin-toolbar-group">
          <button onClick={() => void load()} className="admin-btn admin-btn-secondary">刷新</button>
          <button
            onClick={() => {
              setEditItem(null);
              setShowForm(true);
            }}
            className="admin-btn admin-btn-primary"
          >
            新增资金方
          </button>
        </div>
      </header>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {showForm ? (
        <FunderForm
          item={editItem}
          onClose={() => setShowForm(false)}
          onSaved={async () => {
            await load();
            setShowForm(false);
          }}
        />
      ) : null}

      {accountTarget ? <AccountManager funder={accountTarget} onClose={() => setAccountTarget(null)} onChanged={load} /> : null}

      <section className="table-shell admin-table-shell">
        <div className="admin-table-toolbar">
          <div>
            <div className="admin-table-title">资金方列表</div>
            <p className="admin-table-note">可直接进入账户管理，为资金方新增账户或录入注资。</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3">名称</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">合作模式</th>
                <th className="px-4 py-3">利率</th>
                <th className="px-4 py-3">优先级</th>
                <th className="px-4 py-3">联系人</th>
                <th className="px-4 py-3">登录手机号</th>
                <th className="px-4 py-3">账户数</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">加载中...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">当前没有资金方，请先新增正式资金方和资金账户。</td></tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                    <td className="px-4 py-3 text-slate-600">{TYPE_MAP[item.type] ?? item.type}</td>
                    <td className="px-4 py-3 text-slate-600">{MODE_MAP[item.cooperationMode] ?? item.cooperationMode}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {item.cooperationMode === "FIXED_MONTHLY" ? `${item.monthlyRate}% / 月` : `${item.weeklyRate}% / 7天`}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{item.priority}</td>
                    <td className="px-4 py-3 text-slate-700">{item.contactPerson ?? "-"}{item.contactPhone ? ` (${item.contactPhone})` : ""}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{item.loginPhone ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{item.accountCount}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${item.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-500"}`}>
                        {item.isActive ? "启用" : "停用"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="admin-btn-group">
                        <button onClick={() => { setEditItem(item); setShowForm(true); }} className="text-blue-600 hover:underline">编辑</button>
                        <button onClick={() => setAccountTarget(item)} className="text-emerald-600 hover:underline">账户管理</button>
                        <button onClick={() => void removeFunder(item)} className="text-red-600 hover:underline">删除</button>
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

function FunderForm({
  item,
  onClose,
  onSaved,
}: {
  item: FunderPrefetchItem | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const isEdit = Boolean(item);
  const [form, setForm] = useState({
    name: item?.name ?? "",
    type: item?.type ?? "INDIVIDUAL",
    contactPerson: item?.contactPerson ?? "",
    contactPhone: item?.contactPhone ?? "",
    profitShareRatio: item?.profitShareRatio ?? 0,
    cooperationMode: item?.cooperationMode ?? "FIXED_MONTHLY",
    monthlyRate: item?.monthlyRate ?? 2,
    weeklyRate: item?.weeklyRate ?? 1.5,
    loginPhone: item?.loginPhone ?? "",
    loginPassword: "",
    priority: item?.priority ?? 0,
    riskSharing: item?.riskSharing ?? false,
    riskShareRatio: item?.riskShareRatio ?? 0,
    withdrawalCooldownDays: item?.withdrawalCooldownDays ?? 0,
    remark: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = { ...form };
      if (!payload.loginPhone) delete payload.loginPhone;
      if (!payload.loginPassword) delete payload.loginPassword;

      const res = await fetch(isEdit ? `/api/funders/${item!.id}` : "/api/funders", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "保存失败");
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-form-shell">
      <div className="admin-section-card__header -mx-5 -mt-5 mb-5 border-b border-slate-100 px-5">
        <div>
          <div className="admin-section-card__title">{isEdit ? "编辑资金方" : "新增资金方"}</div>
          <p className="admin-section-card__description">统一管理合作模式、分润比例、风险分担和登录账户信息。</p>
        </div>
        <button onClick={onClose} className="admin-btn admin-btn-secondary admin-btn-sm">关闭</button>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      <div className="admin-form-grid md:grid-cols-3">
        <Field label="名称" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
        <SelectField label="类型" value={form.type} onChange={(value) => setForm({ ...form, type: value })} options={[{ value: "INDIVIDUAL", label: "个人" }, { value: "COMPANY", label: "企业" }, { value: "PLATFORM", label: "平台" }]} />
        <Field label="分润比例" type="number" value={String(form.profitShareRatio)} onChange={(value) => setForm({ ...form, profitShareRatio: Number(value) })} />
        <Field label="联系人" value={form.contactPerson} onChange={(value) => setForm({ ...form, contactPerson: value })} />
        <Field label="联系电话" value={form.contactPhone} onChange={(value) => setForm({ ...form, contactPhone: value })} />
        <Field label="优先级" type="number" value={String(form.priority)} onChange={(value) => setForm({ ...form, priority: Number(value) })} />
      </div>

      <div className="mt-4 admin-form-grid md:grid-cols-4">
        <SelectField label="合作模式" value={form.cooperationMode} onChange={(value) => setForm({ ...form, cooperationMode: value })} options={[{ value: "FIXED_MONTHLY", label: "固定月息" }, { value: "VOLUME_BASED", label: "业务量结算" }]} />
        <Field label="月利率" type="number" value={String(form.monthlyRate)} onChange={(value) => setForm({ ...form, monthlyRate: Number(value) })} />
        <Field label="周利率" type="number" value={String(form.weeklyRate)} onChange={(value) => setForm({ ...form, weeklyRate: Number(value) })} />
        <Field label="提现冷却天数" type="number" value={String(form.withdrawalCooldownDays)} onChange={(value) => setForm({ ...form, withdrawalCooldownDays: Number(value) })} />
      </div>

      <div className="mt-4 admin-form-grid md:grid-cols-3">
        <label className="admin-note-block inline-flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.riskSharing} onChange={(e) => setForm({ ...form, riskSharing: e.target.checked })} />
          开启风险分担
        </label>
        <Field label="风险分担比例" type="number" value={String(form.riskShareRatio)} onChange={(value) => setForm({ ...form, riskShareRatio: Number(value) })} />
        <div />
      </div>

      <div className="mt-4 admin-form-grid md:grid-cols-2">
        <Field label="登录手机号" value={form.loginPhone} onChange={(value) => setForm({ ...form, loginPhone: value })} />
        <Field label={isEdit ? "新密码（留空则不修改）" : "登录密码"} type="password" value={form.loginPassword} onChange={(value) => setForm({ ...form, loginPassword: value })} />
      </div>

      <div className="mt-5 admin-btn-group">
        <button onClick={() => void submit()} disabled={saving} className="admin-btn admin-btn-primary">{saving ? "保存中..." : "保存"}</button>
        <button onClick={onClose} className="admin-btn admin-btn-secondary">取消</button>
      </div>
    </div>
  );
}

function AccountManager({
  funder,
  onClose,
  onChanged,
}: {
  funder: FunderPrefetchItem;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [accounts, setAccounts] = useState<FundAccount[]>([]);
  const [recentInflows, setRecentInflows] = useState<Record<string, CapitalInflow[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accountForm, setAccountForm] = useState({
    accountName: "",
    bankName: "",
    accountNo: "",
  });
  const [inflowForm, setInflowForm] = useState({
    accountId: "",
    amount: "",
    channel: "BANK_TRANSFER",
    remark: "",
  });
  const [deletingInflowId, setDeletingInflowId] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/funders/${funder.id}/accounts`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "加载账户失败");
      const items = data.items ?? [];
      setAccounts(items);
      setInflowForm((current) => ({ ...current, accountId: current.accountId || items[0]?.id || "" }));

      const inflowResults = await Promise.all(
        items.map(async (account: FundAccount) => {
          const inflowRes = await fetch(`/api/fund-accounts/${account.id}/inflows`);
          const inflowData = await inflowRes.json().catch(() => ({}));
          return [account.id, inflowRes.ok ? inflowData.items ?? [] : []] as const;
        }),
      );

      setRecentInflows(Object.fromEntries(inflowResults));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载账户失败");
    } finally {
      setLoading(false);
    }
  }, [funder.id]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  async function createAccount() {
    setError("");
    try {
      const res = await fetch(`/api/funders/${funder.id}/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "新增账户失败");
      setAccountForm({ accountName: "", bankName: "", accountNo: "" });
      await loadAccounts();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "新增账户失败");
    }
  }

  async function injectCapital() {
    setError("");
    try {
      const res = await fetch(`/api/fund-accounts/${inflowForm.accountId}/inflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(inflowForm.amount),
          channel: inflowForm.channel,
          remark: inflowForm.remark || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "资金注入失败");
      setInflowForm((current) => ({ ...current, amount: "", remark: "" }));
      await loadAccounts();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "资金注入失败");
    }
  }

  async function removeInflow(account: FundAccount, inflow: CapitalInflow) {
    if (!window.confirm(`Delete inflow of EUR ${formatMoney(inflow.amount)} from account "${account.accountName}"?`)) return;
    setDeletingInflowId(inflow.id);
    setError("");
    try {
      const res = await fetch(`/api/fund-accounts/${account.id}/inflows/${inflow.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to delete capital inflow");
      await loadAccounts();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete capital inflow");
    } finally {
      setDeletingInflowId(null);
    }
  }

  async function removeAccount(account: FundAccount) {
    if (!window.confirm(`确认删除资金账户“${account.accountName}”吗？`)) return;
    setError("");
    try {
      const res = await fetch(`/api/fund-accounts/${account.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "删除账户失败");
      await loadAccounts();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除账户失败");
    }
  }

  return (
    <div className="admin-section-card">
      <div className="admin-section-card__header">
        <div>
          <div className="admin-section-card__title">账户管理 - {funder.name}</div>
          <p className="admin-section-card__description">可新增 / 删除资金账户，并为账户录入资金池注资。</p>
        </div>
        <button onClick={onClose} className="admin-btn admin-btn-secondary admin-btn-sm">关闭</button>
      </div>

      <div className="admin-section-card__body space-y-5">
        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="admin-note-block admin-note-block--soft">
            <div className="admin-section-card__title text-sm">新增资金账户</div>
            <div className="mt-3 grid gap-3">
              <input className="admin-field text-sm" placeholder="账户名称" value={accountForm.accountName} onChange={(e) => setAccountForm({ ...accountForm, accountName: e.target.value })} />
              <input className="admin-field text-sm" placeholder="开户行" value={accountForm.bankName} onChange={(e) => setAccountForm({ ...accountForm, bankName: e.target.value })} />
              <input className="admin-field text-sm" placeholder="账号" value={accountForm.accountNo} onChange={(e) => setAccountForm({ ...accountForm, accountNo: e.target.value })} />
              <button onClick={() => void createAccount()} className="admin-btn admin-btn-primary">添加账户</button>
            </div>
          </div>

          <div className="admin-note-block admin-note-block--soft">
            <div className="admin-section-card__title text-sm">资金池注入资金</div>
            <div className="mt-3 grid gap-3">
              <select className="admin-field text-sm" value={inflowForm.accountId} onChange={(e) => setInflowForm({ ...inflowForm, accountId: e.target.value })}>
                <option value="">请选择账户</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.accountName} / {account.accountNo}</option>
                ))}
              </select>
              <input className="admin-field text-sm" type="number" min="0" step="0.01" placeholder="注入金额" value={inflowForm.amount} onChange={(e) => setInflowForm({ ...inflowForm, amount: e.target.value })} />
              <input className="admin-field text-sm" placeholder="渠道，例如 BANK_TRANSFER" value={inflowForm.channel} onChange={(e) => setInflowForm({ ...inflowForm, channel: e.target.value })} />
              <input className="admin-field text-sm" placeholder="备注（可选）" value={inflowForm.remark} onChange={(e) => setInflowForm({ ...inflowForm, remark: e.target.value })} />
              <button onClick={() => void injectCapital()} disabled={!inflowForm.accountId || !inflowForm.amount} className="admin-btn admin-btn-success disabled:opacity-50">录入注资</button>
            </div>
          </div>
        </div>

        <div className="table-shell admin-table-shell">
          <div className="admin-table-toolbar">
            <div>
              <div className="admin-table-title">资金账户列表</div>
              <p className="admin-table-note">查看账户余额、累计注资和最近注资记录。</p>
            </div>
          </div>
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">加载中...</div>
          ) : accounts.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">暂无资金账户</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {accounts.map((account) => (
                <div key={account.id} className="space-y-3 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{account.accountName}</p>
                      <p className="text-xs text-slate-500">{account.bankName} / {account.accountNo}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">余额 EUR {formatMoney(account.balance)}</p>
                      <p className="text-xs text-slate-500">累计注资 EUR {formatMoney(account.totalInflow ?? 0)}</p>
                    </div>
                    <button onClick={() => void removeAccount(account)} className="text-sm text-red-600 hover:underline">删除账户</button>
                  </div>

                  <div className="admin-note-block">
                    <p className="text-xs font-medium text-slate-600">最近注资记录</p>
                    {recentInflows[account.id]?.length ? (
                      <div className="mt-2 space-y-2">
                        {recentInflows[account.id].slice(0, 5).map((item) => (
                          <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                            <span>{new Date(item.inflowDate).toLocaleString()}</span>
                            <span>{item.channel}</span>
                            <span>EUR {formatMoney(item.amount)}</span>
                            <span>{item.status}</span>
                            <button
                              onClick={() => void removeInflow(account, item)}
                              disabled={deletingInflowId === item.id}
                              className="text-rose-600 hover:underline disabled:opacity-50"
                            >
                              {deletingInflowId === item.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-400">暂无注资记录</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <input type={type} className="admin-field" value={value} onChange={(e) => onChange(e.target.value)} />
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
