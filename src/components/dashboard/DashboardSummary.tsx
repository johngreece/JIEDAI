"use client";

import { useEffect, useState } from "react";

export type DashboardSummaryData = {
  todayDisbursement: string;
  todayRepayment: string;
  todayOverdue: string;
  outstandingBalance: string;
  customerCount: number;
  activeLoanCount: number;
  overdueRate: string;
  funderBalance: string;
  pendingConfirmRepayment: number;
  pendingSignContract: number;
  pendingDisbursement: number;
  riskCustomerCount: number;
};

const SUMMARY_API = "/api/dashboard/summary";

async function fetchSummary(): Promise<DashboardSummaryData> {
  const res = await fetch(SUMMARY_API);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "获取数据失败");
  }
  return res.json();
}

const CARD_CONFIG: Array<{
  key: keyof DashboardSummaryData;
  label: string;
  color: string;
  format?: (v: string | number) => string;
}> = [
  { key: "todayDisbursement", label: "今日放款", color: "bg-emerald-50 border-emerald-200" },
  { key: "todayRepayment", label: "今日收款", color: "bg-blue-50 border-blue-200" },
  { key: "todayOverdue", label: "今日逾期金额", color: "bg-amber-50 border-amber-200" },
  { key: "outstandingBalance", label: "在贷余额", color: "bg-slate-50 border-slate-200" },
  { key: "customerCount", label: "客户总数", color: "bg-slate-50 border-slate-200", format: (v) => String(v) },
  { key: "activeLoanCount", label: "活跃借款客户数", color: "bg-slate-50 border-slate-200", format: (v) => String(v) },
  { key: "overdueRate", label: "逾期率", color: "bg-amber-50 border-amber-200" },
  { key: "funderBalance", label: "资金方余额", color: "bg-slate-50 border-slate-200" },
  { key: "pendingConfirmRepayment", label: "待确认还款", color: "bg-orange-50 border-orange-200", format: (v) => String(v) },
  { key: "pendingSignContract", label: "待签合同", color: "bg-orange-50 border-orange-200", format: (v) => String(v) },
  { key: "pendingDisbursement", label: "待放款单", color: "bg-orange-50 border-orange-200", format: (v) => String(v) },
  { key: "riskCustomerCount", label: "风险客户数", color: "bg-red-50 border-red-200", format: (v) => String(v) },
];

export function DashboardSummary() {
  const [data, setData] = useState<DashboardSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSummary()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" aria-busy="true">
        {CARD_CONFIG.map(({ label, color }) => (
          <div
            key={label}
            className={`rounded-lg border p-4 ${color} animate-pulse-placeholder`}
            aria-hidden="true"
          >
            <div className="text-sm text-slate-500">{label}</div>
            <div className="h-7 bg-slate-200 rounded mt-2 w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700"
        role="alert"
      >
        <p className="font-medium">数据加载失败</p>
        <p className="text-sm mt-1">{error}</p>
        <p className="text-sm mt-2 text-slate-600">
          请确认已配置数据库（.env 中 DATABASE_URL）并执行 npm run db:push。
        </p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
      role="region"
      aria-label="数据概览"
    >
      {CARD_CONFIG.map(({ key, label, color, format }) => {
        const value = data[key];
        const display = format ? format(value as string | number) : String(value);
        return (
          <div
            key={key}
            className={`dashboard-card rounded-lg border p-4 ${color}`}
          >
            <div className="text-sm text-slate-600">{label}</div>
            <div className="text-lg font-semibold mt-1">{display}</div>
          </div>
        );
      })}
    </div>
  );
}
