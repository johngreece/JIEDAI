"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface DashboardData {
  funder: {
    id: string;
    name: string;
    cooperationMode: string;
    monthlyRate: number;
    weeklyRate: number;
    withdrawalCooldownDays: number;
    profitShareRatio: number;
    accounts: Array<{
      id: string;
      accountName: string;
      bankName: string;
      balance: number;
      totalInflow: number;
      totalOutflow: number;
      totalProfit: number;
    }>;
  };
  ruleGuide: {
    title: string;
    formula: string;
    settlement: string;
  };
  earnings: {
    totalDeposited: number;
    totalDeployed: number;
    idleFunds: number;
    accruedInterest: number;
    withdrawableInterest: number;
    withdrawablePrincipal: number;
    totalWithdrawn: number;
    earningSummary: Array<{
      periodStart: string;
      periodEnd: string;
      principal: number;
      deployed: number;
      rate: number;
      interest: number;
      withdrawable: boolean;
    }>;
    upcomingSettlements: Array<{
      disbursementId: string;
      disbursementNo: string;
      applicationId: string;
      customerName: string;
      principal: number;
      startDate: string;
      nextSettlementDate: string;
      nextCustomerDueDate: string | null;
      expectedInterest: number;
      expectedCollection: number;
      status: "accruing" | "withdrawable";
    }>;
  };
  withdrawals: Array<{
    id: string;
    amount: number;
    type: string;
    status: string;
    interestAmount: number;
    createdAt: string;
  }>;
  recentDisbursements: Array<{
    id: string;
    disbursementNo: string;
    amount: number;
    netAmount: number;
    feeAmount: number;
    status: string;
    disbursedAt: string | null;
    customerName: string;
  }>;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

const withdrawalStatusLabel: Record<string, string> = {
  PENDING: "待审核",
  APPROVED: "已通过",
  REJECTED: "已拒绝",
  PAID: "已打款",
  CONFIRMED: "已确认",
};

export default function FunderDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/funder/dashboard")
      .then((response) => response.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

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

  const { funder, earnings, withdrawals, recentDisbursements, ruleGuide } = data;
  const isMonthly = funder.cooperationMode === "FIXED_MONTHLY";

  return (
    <div className="space-y-8">
      <section className="panel-soft rounded-2xl px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-slate-500">资金方收益面板</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">投资概览</h1>
            <p className="mt-1 text-sm text-slate-600">
              当前模式：{ruleGuide.title}，{isMonthly ? `月利率 ${funder.monthlyRate}%` : `周利率 ${funder.weeklyRate}%`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/funder/withdrawals"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 hover:no-underline"
            >
              去提现
            </Link>
            <Link
              href="/funder/statements"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:no-underline"
            >
              查看对账单
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="总投入" value={formatMoney(earnings.totalDeposited)} />
        <KpiCard label="在贷资金" value={formatMoney(earnings.totalDeployed)} />
        <KpiCard label="累计收益" value={formatMoney(earnings.accruedInterest)} />
        <KpiCard
          label="当前可提"
          value={formatMoney(earnings.withdrawablePrincipal + earnings.withdrawableInterest)}
          note={`本金 ${formatMoney(earnings.withdrawablePrincipal)} · 利息 ${formatMoney(earnings.withdrawableInterest)}`}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <div className="stat-tile rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-slate-900">收益规则说明</h2>
            <div className="mt-4 space-y-3">
              <RuleRow title="计算方式" text={ruleGuide.formula} />
              <RuleRow title="结算规则" text={ruleGuide.settlement} />
              <RuleRow
                title="提现冷静期"
                text={
                  funder.withdrawalCooldownDays > 0
                    ? `上一次通过提现后需等待 ${funder.withdrawalCooldownDays} 天再发起新申请。`
                    : "当前未设置提现冷静期，可按可提现额度申请。"
                }
              />
              <RuleRow
                title="闲置资金"
                text={`当前闲置资金 ${formatMoney(earnings.idleFunds)}，可作为本金申请提现。`}
              />
            </div>
          </div>

          <div className="stat-tile rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">预计回款与收益</h2>
                <p className="mt-1 text-sm text-slate-500">直接看每笔大概几号成熟、几号客户应还、下一笔能赚多少。</p>
              </div>
            </div>

            {earnings.upcomingSettlements.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                当前没有在途资金单笔。
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left">客户 / 放款单</th>
                      <th className="px-4 py-3 text-left">本金</th>
                      <th className="px-4 py-3 text-left">客户下次应还</th>
                      <th className="px-4 py-3 text-left">你下次可结算</th>
                      <th className="px-4 py-3 text-left">预计收益</th>
                      <th className="px-4 py-3 text-left">预计回款</th>
                      <th className="px-4 py-3 text-left">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {earnings.upcomingSettlements.map((item) => (
                      <tr key={item.disbursementId} className="border-t border-slate-100">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{item.customerName}</div>
                          <div className="text-xs text-slate-500">{item.disbursementNo}</div>
                        </td>
                        <td className="px-4 py-3">{formatMoney(item.principal)}</td>
                        <td className="px-4 py-3">{formatDate(item.nextCustomerDueDate)}</td>
                        <td className="px-4 py-3">{formatDate(item.nextSettlementDate)}</td>
                        <td className="px-4 py-3 font-medium text-amber-600">{formatMoney(item.expectedInterest)}</td>
                        <td className="px-4 py-3">{formatMoney(item.expectedCollection)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                              item.status === "withdrawable"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {item.status === "withdrawable" ? "已有可提收益" : "继续计息中"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="stat-tile rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-slate-900">资金账户</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {funder.accounts.map((account) => (
                <div key={account.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">{account.accountName}</div>
                  <div className="mt-1 text-xs text-slate-500">{account.bankName}</div>
                  <div className="mt-3 text-xl font-bold text-emerald-700">{formatMoney(account.balance)}</div>
                  <div className="mt-3 space-y-1 text-xs text-slate-500">
                    <div>累计入金 {formatMoney(account.totalInflow)}</div>
                    <div>累计出金 {formatMoney(account.totalOutflow)}</div>
                    <div>账户利润 {formatMoney(account.totalProfit)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="stat-tile rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-slate-900">提现概况</h2>
            <div className="mt-4 space-y-3">
              <AmountRow label="可提本金" value={formatMoney(earnings.withdrawablePrincipal)} />
              <AmountRow label="可提利息" value={formatMoney(earnings.withdrawableInterest)} tone="amber" />
              <AmountRow label="累计已提" value={formatMoney(earnings.totalWithdrawn)} />
            </div>
            <Link
              href="/funder/withdrawals"
              className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 hover:no-underline"
            >
              管理提现
            </Link>
          </div>

          <div className="stat-tile rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-slate-900">最近提现</h2>
            <div className="mt-4 space-y-3">
              {withdrawals.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                  暂无提现记录。
                </div>
              ) : (
                withdrawals.slice(0, 5).map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-slate-900">{formatMoney(item.amount)}</div>
                        <div className="mt-1 text-xs text-slate-500">{formatDate(item.createdAt)}</div>
                      </div>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">
                        {withdrawalStatusLabel[item.status] || item.status}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      其中利息 {formatMoney(item.interestAmount)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="stat-tile rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-slate-900">近期放款</h2>
            <div className="mt-4 space-y-3">
              {recentDisbursements.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                  暂无放款记录。
                </div>
              ) : (
                recentDisbursements.slice(0, 6).map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-slate-900">{item.customerName}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.disbursementNo}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-slate-900">{formatMoney(item.netAmount)}</div>
                        <div className="mt-1 text-xs text-slate-500">{formatDate(item.disbursedAt)}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function KpiCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat-tile rounded-2xl p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-3 text-2xl font-bold text-slate-900">{value}</div>
      {note ? <div className="mt-2 text-xs text-slate-500">{note}</div> : null}
    </div>
  );
}

function RuleRow({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-sm text-slate-600">{text}</div>
    </div>
  );
}

function AmountRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "amber";
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-semibold ${tone === "amber" ? "text-amber-600" : "text-slate-900"}`}>{value}</span>
    </div>
  );
}
