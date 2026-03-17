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
  description?: string;
  icon?: (className: string) => JSX.Element;
  trend?: string; // Mock trend for UI
}> = [
  { key: "todayDisbursement", label: "今日放款", description: "¥" },
  { key: "todayRepayment", label: "今日收款", description: "¥" },
  { key: "todayOverdue", label: "今日逾期", description: "¥" },
  { key: "outstandingBalance", label: "在贷余额", description: "¥ Total" },
  
  { key: "customerCount", label: "客户总数" },
  { key: "activeLoanCount", label: "活跃客户" },
  { key: "overdueRate", label: "逾期率" },
  { key: "funderBalance", label: "资方余额" },

  { key: "pendingConfirmRepayment", label: "待确认还款" },
  { key: "pendingSignContract", label: "待签合同" },
  { key: "pendingDisbursement", label: "待放款" },
  { key: "riskCustomerCount", label: "风险客户" },
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
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
         {[...Array(8)].map((_, i) => (
           <div key={i} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm animate-pulse">
             <div className="h-4 w-1/2 rounded bg-slate-100 mb-4"></div>
             <div className="h-8 w-3/4 rounded bg-slate-100"></div>
           </div>
         ))}
       </div>
     )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
        <div className="flex items-center gap-3">
           <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
           </svg>
           <h3 className="font-medium">无法加载数据</h3>
        </div>
        <p className="mt-2 text-sm text-red-600/90">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {CARD_CONFIG.map((card) => {
        const value = data[card.key];
        // Simple highlight logic
        const highlight = card.key.includes("pending") && Number(value) > 0;
        const isMoney = card.description?.includes("¥");

        return (
          <div
            key={card.key}
            className={`rounded-xl border bg-white p-6 shadow-sm transition-all hover:shadow-md ${
              highlight ? "border-orange-200 bg-orange-50/30" : "border-slate-200"
            }`}
          >
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-500">{card.label}</span>
              <div className="flex items-baseline gap-2">
                 <span className={`text-2xl font-bold tracking-tight ${highlight ? "text-orange-600" : "text-slate-900"}`}>
                   {value}
                 </span>
                 {isMoney && <span className="text-xs font-medium text-slate-400">RMB</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
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
