"use client";

import { useCallback, useEffect, useState } from "react";

type Funder = {
  id: string;
  name: string;
  type: string;
  contactPerson: string | null;
  contactPhone: string | null;
  profitShareRatio: number | null;
  cooperationMode: string;
  monthlyRate: number;
  weeklyRate: number;
  loginPhone: string | null;
  priority: number;
  riskSharing: boolean;
  riskShareRatio: number;
  withdrawalCooldownDays: number;
  isActive: boolean;
  accountCount: number;
  createdAt: string;
};

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

export default function FundersPage() {
  const [items, setItems] = useState<Funder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Funder | null>(null);
  const [accountTarget, setAccountTarget] = useState<Funder | null>(null);

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

  useEffect(() => {
    void load();
  }, []);

  async function removeFunder(item: Funder) {
    if (!window.confirm(`确认删除资金方“${item.name}”吗？已有历史的账户会自动停用。`)) {
      return;
    }

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
      <header className="panel-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">资金方管理</h1>
          <p className="mt-1 text-sm text-slate-600">系统管理员可新增、编辑、删除资金方，并管理资金账户与资金池注入。</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load()} className="btn-soft rounded-lg px-3 py-2 text-sm">
            刷新
          </button>
          <button
            onClick={() => {
              setEditItem(null);
              setShowForm(true);
            }}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
          >
            新增资金方
          </button>
        </div>
      </header>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

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

      {accountTarget ? (
        <AccountManager
          funder={accountTarget}
          onClose={() => setAccountTarget(null)}
          onChanged={load}
        />
      ) : null}

      <section className="table-shell overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
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
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                    加载中...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                    当前没有资金方，请先新增正式资金方和资金账户。
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                    <td className="px-4 py-3 text-slate-600">{TYPE_MAP[item.type] ?? item.type}</td>
                    <td className="px-4 py-3 text-slate-600">{MODE_MAP[item.cooperationMode] ?? item.cooperationMode}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {item.cooperationMode === "FIXED_MONTHLY" ? `${item.monthlyRate}% / 月` : `${item.weeklyRate}% / 7天`}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{item.priority}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {item.contactPerson ?? "-"}
                      {item.contactPhone ? ` (${item.contactPhone})` : ""}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{item.loginPhone ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{item.accountCount}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                          item.isActive
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-100 text-slate-500"
                        }`}
                      >
                        {item.isActive ? "启用" : "停用"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={() => {
                            setEditItem(item);
                            setShowForm(true);
                          }}
                          className="text-blue-600 hover:underline"
                        >
                          编辑
                        </button>
                        <button onClick={() => setAccountTarget(item)} className="text-emerald-600 hover:underline">
                          账户管理
                        </button>
                        <button onClick={() => void removeFunder(item)} className="text-red-600 hover:underline">
                          删除
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

function FunderForm({
  item,
  onClose,
  onSaved,
}: {
  item: Funder | null;
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
    <div className="panel-soft rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">{isEdit ? "编辑资金方" : "新增资金方"}</h2>
        <button onClick={onClose} className="btn-soft rounded-lg px-3 py-2 text-sm">
          关闭
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <label className="block">
          <span className="text-sm text-slate-600">名称</span>
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">类型</span>
          <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="INDIVIDUAL">个人</option>
            <option value="COMPANY">企业</option>
            <option value="PLATFORM">平台</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">分润比例</span>
          <input type="number" step="0.01" min="0" max="1" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.profitShareRatio} onChange={(e) => setForm({ ...form, profitShareRatio: Number(e.target.value) })} />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">联系人</span>
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">联系电话</span>
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">优先级</span>
          <input type="number" min="0" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <label className="block">
          <span className="text-sm text-slate-600">合作模式</span>
          <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.cooperationMode} onChange={(e) => setForm({ ...form, cooperationMode: e.target.value })}>
            <option value="FIXED_MONTHLY">固定月息</option>
            <option value="VOLUME_BASED">业务量结算</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">月利率</span>
          <input type="number" step="0.1" min="0" max="100" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.monthlyRate} onChange={(e) => setForm({ ...form, monthlyRate: Number(e.target.value) })} />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">周利率</span>
          <input type="number" step="0.1" min="0" max="100" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.weeklyRate} onChange={(e) => setForm({ ...form, weeklyRate: Number(e.target.value) })} />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">提现冷却天数</span>
          <input type="number" min="0" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.withdrawalCooldownDays} onChange={(e) => setForm({ ...form, withdrawalCooldownDays: Number(e.target.value) })} />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <input type="checkbox" checked={form.riskSharing} onChange={(e) => setForm({ ...form, riskSharing: e.target.checked })} />
          <span className="text-sm text-slate-700">开启风险分担</span>
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">风险分担比例</span>
          <input type="number" step="0.01" min="0" max="1" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.riskShareRatio} onChange={(e) => setForm({ ...form, riskShareRatio: Number(e.target.value) })} />
        </label>
        <div />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm text-slate-600">登录手机号</span>
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.loginPhone} onChange={(e) => setForm({ ...form, loginPhone: e.target.value })} />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">{isEdit ? "新密码（留空则不修改）" : "登录密码"}</span>
          <input type="password" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.loginPassword} onChange={(e) => setForm({ ...form, loginPassword: e.target.value })} />
        </label>
      </div>

      <div className="flex gap-3">
        <button onClick={() => void submit()} disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50">
          {saving ? "保存中..." : "保存"}
        </button>
        <button onClick={onClose} className="btn-soft rounded-lg px-4 py-2 text-sm">
          取消
        </button>
      </div>
    </div>
  );
}

function AccountManager({
  funder,
  onClose,
  onChanged,
}: {
  funder: Funder;
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

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/funders/${funder.id}/accounts`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "加载账户失败");
      const items = data.items ?? [];
      setAccounts(items);
      setInflowForm((current) => ({
        ...current,
        accountId: current.accountId || items[0]?.id || "",
      }));

      const inflowResults = await Promise.all(
        items.map(async (account: FundAccount) => {
          const inflowRes = await fetch(`/api/fund-accounts/${account.id}/inflows`);
          const inflowData = await inflowRes.json().catch(() => ({}));
          return [account.id, inflowRes.ok ? inflowData.items ?? [] : []] as const;
        })
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

  async function removeAccount(account: FundAccount) {
    if (!window.confirm(`确认删除资金账户“${account.accountName}”吗？`)) {
      return;
    }

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
    <div className="panel-soft rounded-xl p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">账户管理 - {funder.name}</h2>
          <p className="text-sm text-slate-600">可新增/删除资金账户，并为账户录入资金池注入。</p>
        </div>
        <button onClick={onClose} className="btn-soft rounded-lg px-3 py-2 text-sm">
          关闭
        </button>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">新增资金账户</h3>
          <div className="mt-3 grid gap-3">
            <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="账户名称" value={accountForm.accountName} onChange={(e) => setAccountForm({ ...accountForm, accountName: e.target.value })} />
            <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="开户行" value={accountForm.bankName} onChange={(e) => setAccountForm({ ...accountForm, bankName: e.target.value })} />
            <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="账号" value={accountForm.accountNo} onChange={(e) => setAccountForm({ ...accountForm, accountNo: e.target.value })} />
            <button onClick={() => void createAccount()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
              添加账户
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">资金池注入资金</h3>
          <div className="mt-3 grid gap-3">
            <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={inflowForm.accountId} onChange={(e) => setInflowForm({ ...inflowForm, accountId: e.target.value })}>
              <option value="">请选择账户</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.accountName} / {account.accountNo}
                </option>
              ))}
            </select>
            <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="注入金额" value={inflowForm.amount} onChange={(e) => setInflowForm({ ...inflowForm, amount: e.target.value })} />
            <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="渠道，例如 BANK_TRANSFER" value={inflowForm.channel} onChange={(e) => setInflowForm({ ...inflowForm, channel: e.target.value })} />
            <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="备注（可选）" value={inflowForm.remark} onChange={(e) => setInflowForm({ ...inflowForm, remark: e.target.value })} />
            <button onClick={() => void injectCapital()} disabled={!inflowForm.accountId || !inflowForm.amount} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">
              录入注资
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">资金账户列表</h3>
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
                    <p className="text-xs text-slate-500">
                      {account.bankName} / {account.accountNo}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">余额 €{formatMoney(account.balance)}</p>
                    <p className="text-xs text-slate-500">累计注资 €{formatMoney(account.totalInflow ?? 0)}</p>
                  </div>
                  <button onClick={() => void removeAccount(account)} className="text-sm text-red-600 hover:underline">
                    删除账户
                  </button>
                </div>

                <div className="rounded-lg bg-slate-50 px-3 py-3">
                  <p className="text-xs font-medium text-slate-600">最近注资记录</p>
                  {recentInflows[account.id]?.length ? (
                    <div className="mt-2 space-y-2">
                      {recentInflows[account.id].slice(0, 5).map((item) => (
                        <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                          <span>{new Date(item.inflowDate).toLocaleString()}</span>
                          <span>{item.channel}</span>
                          <span>€{formatMoney(item.amount)}</span>
                          <span>{item.status}</span>
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
  );
}
