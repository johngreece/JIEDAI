"use client";

import { useEffect, useState } from "react";

interface DashboardData {
  funder: {
    id: string;
    name: string;
    cooperationMode: string;
    monthlyRate: number;
    weeklyRate: number;
    accounts: {
      id: string;
      accountName: string;
      bankName: string;
      balance: number;
      totalInflow: number;
      totalOutflow: number;
      totalProfit: number;
    }[];
  };
  earnings: {
    totalDeposited: number;
    totalDeployed: number;
    idleFunds: number;
    accruedInterest: number;
    withdrawableInterest: number;
    withdrawablePrincipal: number;
    totalWithdrawn: number;
    earningSummary: {
      periodStart: string;
      periodEnd: string;
      principal: number;
      deployed: number;
      rate: number;
      interest: number;
      withdrawable: boolean;
    }[];
  };
  withdrawals: {
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
  }[];
  recentDisbursements: {
    id: string;
    disbursementNo: string;
    amount: number;
    netAmount: number;
    feeAmount: number;
    status: string;
    disbursedAt: string | null;
    customerName: string;
  }[];
}

const modeLabel: Record<string, string> = {
  FIXED_MONTHLY: "固定月息",
  VOLUME_BASED: "业务量结算",
};
const typeLabel: Record<string, string> = {
  PRINCIPAL: "提取本金",
  INTEREST: "提取利息",
  PRINCIPAL_AND_INTEREST: "本息一起",
};
const statusLabel: Record<string, string> = {
  PENDING: "待审批",
  APPROVED: "已通过",
  REJECTED: "已拒绝",
  PAID: "已打款",
  CONFIRMED: "已确认",
};
const statusBadge: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
  PAID: "bg-emerald-100 text-emerald-700",
  CONFIRMED: "bg-emerald-100 text-emerald-700",
};

function fmt(n: number) {
  return "€" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function FunderDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/funder/dashboard")
      .then((r) => r.json())
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
    return <div className="py-12 text-center text-slate-500">加载失败</div>;
  }

  const { funder, earnings, withdrawals, recentDisbursements } = data;
  const isFixed = funder.cooperationMode === "FIXED_MONTHLY";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">投资概览</h1>
          <p className="text-sm text-slate-500">
            合作模式：
            <span className="ml-1 inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              {modeLabel[funder.cooperationMode] ?? funder.cooperationMode}
            </span>
            <span className="ml-3 text-slate-400">
              {isFixed
                ? `月利率 ${funder.monthlyRate}%`
                : `周利率 ${funder.weeklyRate}%（7天周期）`}
            </span>
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="总投入" value={fmt(earnings.totalDeposited)} icon={<IconWallet />} color="emerald" />
        <KpiCard label="在贷金额" value={fmt(earnings.totalDeployed)} icon={<IconDeploy />} color="teal" />
        <KpiCard label="累计利息" value={fmt(earnings.accruedInterest)} icon={<IconInterest />} color="amber" />
        <KpiCard
          label="可提现"
          value={fmt(earnings.withdrawableInterest + earnings.withdrawablePrincipal)}
          icon={<IconWithdraw />}
          color="blue"
          sub={`本金 ${fmt(earnings.withdrawablePrincipal)} · 利息 ${fmt(earnings.withdrawableInterest)}`}
        />
      </div>

      {/* Accounts */}
      {funder.accounts.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-800">资金账户</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {funder.accounts.map((acct) => (
              <div key={acct.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-medium text-slate-700">{acct.accountName}</div>
                <div className="text-xs text-slate-400">{acct.bankName}</div>
                <div className="mt-3 text-xl font-bold text-emerald-600">{fmt(acct.balance)}</div>
                <div className="mt-1 flex gap-3 text-xs text-slate-500">
                  <span>入 {fmt(acct.totalInflow)}</span>
                  <span>出 {fmt(acct.totalOutflow)}</span>
                  <span>利润 {fmt(acct.totalProfit)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Earnings Breakdown */}
      {earnings.earningSummary.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-800">收益明细</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-4 py-3">起始日期</th>
                  <th className="px-4 py-3">{isFixed ? "投入本金" : "放出金额"}</th>
                  <th className="px-4 py-3">利率</th>
                  <th className="px-4 py-3">产生利息</th>
                  <th className="px-4 py-3">可提现</th>
                </tr>
              </thead>
              <tbody>
                {earnings.earningSummary.map((e, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-3">{fmtDate(e.periodStart)}</td>
                    <td className="px-4 py-3 font-medium">{fmt(e.principal)}</td>
                    <td className="px-4 py-3">{e.rate}%{isFixed ? "/月" : "/7天"}</td>
                    <td className="px-4 py-3 font-medium text-amber-600">{fmt(e.interest)}</td>
                    <td className="px-4 py-3">
                      {e.withdrawable ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">可提</span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">未满期</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recent Disbursements */}
      {recentDisbursements.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-800">近期放款</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-4 py-3">放款编号</th>
                  <th className="px-4 py-3">客户</th>
                  <th className="px-4 py-3">放款金额</th>
                  <th className="px-4 py-3">实际到手</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">日期</th>
                </tr>
              </thead>
              <tbody>
                {recentDisbursements.map((d) => (
                  <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono text-xs">{d.disbursementNo}</td>
                    <td className="px-4 py-3">{d.customerName}</td>
                    <td className="px-4 py-3 font-medium">{fmt(d.amount)}</td>
                    <td className="px-4 py-3">{fmt(d.netAmount)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadge[d.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {statusLabel[d.status] ?? d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(d.disbursedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Withdrawal History */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">提现记录</h2>
        {withdrawals.length === 0 ? (
          <p className="py-8 text-center text-slate-400">暂无提现记录</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-4 py-3">申请时间</th>
                  <th className="px-4 py-3">类型</th>
                  <th className="px-4 py-3">金额</th>
                  <th className="px-4 py-3">利息部分</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">备注</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-slate-500">{fmtDate(w.createdAt)}</td>
                    <td className="px-4 py-3">{typeLabel[w.type] ?? w.type}</td>
                    <td className="px-4 py-3 font-medium">{fmt(w.amount)}</td>
                    <td className="px-4 py-3 text-amber-600">{fmt(w.interestAmount)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadge[w.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {statusLabel[w.status] ?? w.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{w.remark ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// --- KPI Card ---
function KpiCard({ label, value, icon, color, sub }: { label: string; value: string; icon: React.ReactNode; color: string; sub?: string }) {
  const bgMap: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600",
    teal: "bg-teal-50 text-teal-600",
    amber: "bg-amber-50 text-amber-600",
    blue: "bg-blue-50 text-blue-600",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${bgMap[color] ?? bgMap.emerald}`}>{icon}</div>
        <div>
          <div className="text-xs text-slate-500">{label}</div>
          <div className="text-lg font-bold text-slate-900">{value}</div>
        </div>
      </div>
      {sub && <div className="mt-2 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

// --- Icons ---
function IconWallet() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  );
}
function IconDeploy() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}
function IconInterest() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function IconWithdraw() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}
