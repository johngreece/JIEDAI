"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

interface Withdrawal {
  id: string;
  amount: number;
  type: string;
  status: string;
  includeInterest: boolean;
  interestAmount: number;
  remark: string | null;
  createdAt: string;
  approvedAt: string | null;
  rejectedReason: string | null;
}

interface WithdrawalData {
  funder: {
    cooperationMode: string;
    monthlyRate: number;
    weeklyRate: number;
    withdrawalCooldownDays: number;
  } | null;
  withdrawals: Withdrawal[];
  withdrawableInterest: number;
  withdrawablePrincipal: number;
}

const typeLabel: Record<string, string> = {
  PRINCIPAL: "只提本金",
  INTEREST: "只提收益",
  PRINCIPAL_AND_INTEREST: "本息一起提",
};

const statusLabel: Record<string, string> = {
  PENDING: "待审核",
  APPROVED: "已通过",
  REJECTED: "已拒绝",
};

const statusBadge: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
};

function fmt(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function fmtDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default function FunderWithdrawalsPage() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<WithdrawalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "INTEREST", amount: "", remark: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadData = () => {
    fetch("/api/funder/withdrawals")
      .then((response) => response.json())
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const withdrawableInterest = data?.withdrawableInterest ?? 0;
  const withdrawablePrincipal = data?.withdrawablePrincipal ?? 0;

  useEffect(() => {
    if (!data) return;

    const open = searchParams.get("open") === "1";
    const type = searchParams.get("type");
    const prefill = searchParams.get("prefill");

    if (!open) return;

    let nextType = type && ["INTEREST", "PRINCIPAL", "PRINCIPAL_AND_INTEREST"].includes(type)
      ? type
      : "INTEREST";
    let nextAmount = "";

    if (prefill === "withdrawable-interest") {
      nextAmount = String(withdrawableInterest || "");
      nextType = "INTEREST";
    } else if (prefill === "withdrawable-principal") {
      nextAmount = String(withdrawablePrincipal || "");
      nextType = "PRINCIPAL";
    }

    setShowForm(true);
    setForm((current) => ({
      ...current,
      type: nextType,
      amount: nextAmount,
    }));
  }, [data, searchParams, withdrawableInterest, withdrawablePrincipal]);

  const maxAmount = useMemo(() => {
    if (form.type === "INTEREST") return withdrawableInterest;
    if (form.type === "PRINCIPAL") return withdrawablePrincipal;
    return withdrawableInterest + withdrawablePrincipal;
  }, [form.type, withdrawableInterest, withdrawablePrincipal]);

  const modeText =
    data?.funder?.cooperationMode === "FIXED_MONTHLY"
      ? `固定月结，按月利率 ${data.funder.monthlyRate}% 结算。`
      : `周收益模式，按周利率 ${data?.funder?.weeklyRate ?? 0}% 结算。`;

  const handleSubmit = async () => {
    setError("");
    const amount = Number(form.amount);

    if (!amount || amount <= 0) {
      setError("请输入有效提现金额。");
      return;
    }

    if (amount > maxAmount) {
      setError(`当前最多可提 ${fmt(maxAmount)}。`);
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/funder/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          amount,
          includeInterest: form.type !== "PRINCIPAL",
          remark: form.remark || undefined,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        setError(result.error || "提交失败");
        return;
      }

      setShowForm(false);
      setForm({ type: "INTEREST", amount: "", remark: "" });
      loadData();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return <div className="py-12 text-center text-slate-500">加载失败，请稍后重试。</div>;
  }

  return (
    <div className="space-y-6">
      <header className="panel-soft rounded-2xl px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">提现管理</h1>
            <p className="mt-1 text-sm text-slate-600">
              {modeText}
              {data.funder?.withdrawalCooldownDays
                ? ` 提现后需要等待 ${data.funder.withdrawalCooldownDays} 天才能再次发起下一次申请。`
                : " 当前未设置提现冷静期。"}
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-700"
            onClick={() => setShowForm((value) => !value)}
          >
            {showForm ? "收起表单" : "发起提现"}
          </button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <AmountCard title="可提本金" value={fmt(withdrawablePrincipal)} hint="来自当前可用资金" />
        <AmountCard title="可提现收益" value={fmt(withdrawableInterest)} hint="来自已满足结算条件的收益" tone="amber" />
        <AmountCard title="合计可提" value={fmt(withdrawablePrincipal + withdrawableInterest)} hint="提交时以当前额度为准" tone="emerald" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <div className="stat-tile rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-slate-900">提现规则</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <RuleBox title="只提收益" text="只提已经满足条件、当前可提现的收益，不会动用本金。" />
              <RuleBox title="只提本金" text="只提账户中可用本金。提前取回本金后，这部分本金不再继续产生新收益。" />
              <RuleBox title="本息一起提" text="系统会优先使用可提现收益，剩余部分再从可提本金中扣减。" />
              <RuleBox title="自动跳转预填" text="从“可提现收益”通知进入时，系统会自动展开表单并预填当前可提金额。" />
            </div>
          </div>

          {showForm ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
              <h2 className="text-lg font-semibold text-slate-900">新建提现申请</h2>
              <div className="mt-4 grid gap-4">
                <label className="text-sm text-slate-600">
                  提现类型
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.type}
                    onChange={(event) => setForm({ ...form, type: event.target.value, amount: "" })}
                  >
                    <option value="INTEREST">只提收益</option>
                    <option value="PRINCIPAL">只提本金</option>
                    <option value="PRINCIPAL_AND_INTEREST">本息一起提</option>
                  </select>
                </label>

                <label className="text-sm text-slate-600">
                  提现金额（当前最多 {fmt(maxAmount)}）
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(event) => setForm({ ...form, amount: event.target.value })}
                  />
                </label>

                <label className="text-sm text-slate-600">
                  备注
                  <input
                    type="text"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="选填"
                    value={form.remark}
                    onChange={(event) => setForm({ ...form, remark: event.target.value })}
                  />
                </label>

                {form.type === "PRINCIPAL" ? (
                  <p className="text-xs text-amber-600">
                    提示：提前取回本金后，这部分本金将不再继续产生新收益。
                  </p>
                ) : null}

                {error ? <p className="text-sm text-red-600">{error}</p> : null}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "提交中..." : "提交申请"}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="stat-tile rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-slate-900">提现记录</h2>
          {data.withdrawals.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
              暂无提现记录。
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left">申请时间</th>
                    <th className="px-4 py-3 text-left">类型</th>
                    <th className="px-4 py-3 text-left">金额</th>
                    <th className="px-4 py-3 text-left">收益部分</th>
                    <th className="px-4 py-3 text-left">状态</th>
                    <th className="px-4 py-3 text-left">审核时间</th>
                    <th className="px-4 py-3 text-left">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {data.withdrawals.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-500">{fmtDate(item.createdAt)}</td>
                      <td className="px-4 py-3">{typeLabel[item.type] ?? item.type}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{fmt(item.amount)}</td>
                      <td className="px-4 py-3 text-amber-600">{fmt(item.interestAmount)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadge[item.status] ?? "bg-slate-100 text-slate-600"}`}>
                          {statusLabel[item.status] ?? item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{fmtDate(item.approvedAt)}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {item.status === "REJECTED" && item.rejectedReason ? item.rejectedReason : item.remark || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function AmountCard({
  title,
  value,
  hint,
  tone = "default",
}: {
  title: string;
  value: string;
  hint: string;
  tone?: "default" | "amber" | "emerald";
}) {
  const colorClass =
    tone === "amber"
      ? "text-amber-600"
      : tone === "emerald"
        ? "text-emerald-600"
        : "text-slate-900";

  return (
    <div className="stat-tile rounded-2xl p-5">
      <div className="text-sm text-slate-500">{title}</div>
      <div className={`mt-3 text-2xl font-bold ${colorClass}`}>{value}</div>
      <div className="mt-2 text-xs text-slate-500">{hint}</div>
    </div>
  );
}

function RuleBox({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-sm text-slate-600">{text}</div>
    </div>
  );
}
