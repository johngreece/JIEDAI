"use client";

import { useEffect, useState, useMemo, useCallback } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
type D = Record<string, any>;

const SUMMARY_API = "/api/dashboard/summary";
const SMART_API = "/api/dashboard/smart";

async function fetchJson(url: string): Promise<D> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text() || "获取数据失败");
  return res.json();
}

/* ─── 简易 SVG 柱状图 ─── */
function MiniBarChart({ data, valueKey, label, color = "#3b82f6" }: {
  data: { date: string;[k: string]: any }[];
  valueKey: string;
  label: string;
  color?: string;
}) {
  const vals = data.map((d) => Number(d[valueKey] || 0));
  const max = Math.max(...vals, 1);
  return (
    <div>
      <div className="text-xs font-medium text-slate-500 mb-2">{label}</div>
      <div className="flex items-end gap-1 h-24">
        {data.map((d, i) => {
          const h = (vals[i] / max) * 100;
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                {d.date.slice(5)}: €{vals[i].toFixed(0)}
              </div>
              <div
                className="w-full rounded-t transition-all"
                style={{ height: `${Math.max(h, 2)}%`, backgroundColor: color, minHeight: 2 }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 mt-1">
        {data.map((d) => (
          <div key={d.date} className="flex-1 text-center text-[9px] text-slate-400">
            {d.date.slice(8)}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── 环形进度 ─── */
function DonutRing({ value, max, size = 56, color = "#3b82f6", label }: {
  value: number; max: number; size?: number; color?: string; label: string;
}) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={5} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x={size / 2} y={size / 2} textAnchor="middle" dy="0.35em" className="text-[10px] font-bold fill-slate-700">
          {(pct * 100).toFixed(0)}%
        </text>
      </svg>
      <span className="text-[10px] text-slate-500">{label}</span>
    </div>
  );
}

/* ─── 大号健康评分仪表盘 ─── */
function HealthGauge({ score }: { score: number }) {
  const size = 120;
  const r = 48;
  const circ = 2 * Math.PI * r;
  const halfCirc = circ * 0.75; // 270 度弧
  const offset = halfCirc * (1 - score / 100);
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444";
  const label = score >= 80 ? "健康" : score >= 60 ? "注意" : "危险";
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.75}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={8}
          strokeDasharray={halfCirc} strokeDashoffset={0}
          strokeLinecap="round" transform={`rotate(135 ${size / 2} ${size / 2})`} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={halfCirc} strokeDashoffset={offset}
          strokeLinecap="round" transform={`rotate(135 ${size / 2} ${size / 2})`} />
        <text x={size / 2} y={size / 2 - 4} textAnchor="middle" className="text-2xl font-bold" fill={color}>{score}</text>
        <text x={size / 2} y={size / 2 + 14} textAnchor="middle" className="text-[10px]" fill="#94a3b8">{label}</text>
      </svg>
    </div>
  );
}

/* ─── KPI 卡 ─── */
function KpiCard({ title, value, sub, icon, highlight, onClick }: {
  title: string; value: string | number; sub?: string; icon: React.ReactNode;
  highlight?: boolean; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`stat-tile rounded-xl p-5 transition-all hover:shadow-md ${highlight ? "border-orange-200 bg-orange-50/30 cursor-pointer" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">{title}</span>
          <span className={`text-xl font-bold tracking-tight ${highlight ? "text-orange-600" : "text-slate-900"}`}>
            {value}
          </span>
          {sub && <span className="text-[11px] text-slate-400 mt-0.5">{sub}</span>}
        </div>
        <div className="flex-shrink-0 text-slate-300">{icon}</div>
      </div>
    </div>
  );
}

/* ─── 紧急度 Badge ─── */
const urgencyStyle: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-blue-100 text-blue-700 border-blue-200",
};
const urgencyDot: Record<string, string> = {
  critical: "bg-red-500 animate-pulse", high: "bg-orange-500",
  medium: "bg-amber-500", low: "bg-blue-400",
};
const urgencyLabel: Record<string, string> = {
  critical: "紧急", high: "重要", medium: "一般", low: "提醒",
};

/* ─── 迷你水平条(用于分布图) ─── */
function HorizontalBar({ label, value, total, color }: {
  label: string; value: number; total: number; color: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 w-16 shrink-0 text-right">{label}</span>
      <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden relative">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-medium text-slate-600 w-10">{value}</span>
    </div>
  );
}

/* ─── 图标 SVG ─── */
const ICO = {
  money: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.637.392M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  users: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>,
  warn: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>,
  bank: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>,
  chart: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
  clock: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  profit: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>,
  bell: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>,
  shield: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>,
  spark: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" /></svg>,
};

/* ═══════════════════════════════════════════ */
export function DashboardSummary() {
  const [data, setData] = useState<D | null>(null);
  const [smart, setSmart] = useState<D | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "smart" | "customers" | "finance">("overview");

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([fetchJson(SUMMARY_API), fetchJson(SMART_API)])
      .then(([summaryData, smartData]) => { setData(summaryData); setSmart(smartData); })
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  /* ─ 利润最大化建议 ─ */
  const profitTips = useMemo(() => {
    if (!data) return [];
    const tips: string[] = [];
    const overdueRate = parseFloat(String(data.overdueRate || "0"));
    const profitRate = Number(data.profitRate || 0);
    const turnover = Number(data.turnoverRate || 0);
    const settledCount = Number(data.settledCount || 0);
    const totalCount = Number(data.totalDisbursedCount || 0);
    if (overdueRate > 15) tips.push("逾期率偏高(>" + overdueRate.toFixed(1) + "%)，建议收紧审批标准或提高逾期罚息费率");
    if (profitRate < 5 && totalCount > 0) tips.push("综合利润率仅 " + profitRate + "%，建议考虑提高砍头费率或缩短还款周期以加速资金周转");
    if (turnover < 2 && totalCount > 0) tips.push("资金周转率偏低(" + turnover + ")，提高放款频次或减少闲置资金可提升收益");
    if (settledCount > 0 && totalCount > 0 && settledCount / totalCount > 0.6) tips.push("结清率良好(" + ((settledCount / totalCount) * 100).toFixed(0) + "%)，可适当放宽额度以增加放款量");
    if (Number(data.upcomingDue7d) > Number(data.funderBalance) * 0.8) tips.push("⚠ 7天内到期金额接近资金池余额，需关注现金流");
    if (tips.length === 0) tips.push("当前各项指标健康，继续保持！");
    return tips;
  }, [data]);

  // ─ 紧急待办数量 ─
  const urgentCount = useMemo(() => {
    if (!smart?.smartTodos) return 0;
    return smart.smartTodos.filter((t: any) => t.urgency === "critical" || t.urgency === "high").length;
  }, [smart]);

  // ─ Loading ─
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="stat-tile rounded-xl p-6 animate-pulse">
              <div className="h-4 w-1/2 rounded bg-slate-100 mb-4" />
              <div className="h-8 w-3/4 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    );
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

  const fmt = (v: any) => {
    const n = Number(v || 0);
    return n >= 10000 ? n .toLocaleString() : n.toFixed(2);
  };

  const tabs = [
    { key: "overview" as const, label: "业务总览" },
    { key: "smart" as const, label: "智能预警", badge: urgentCount },
    { key: "customers" as const, label: "客户画像" },
    { key: "finance" as const, label: "财务分析" },
  ];

  return (
    <div className="space-y-6">

      {/* ━━━ 顶部标签导航 ━━━ */}
      <div className="flex items-center gap-1 border-b border-slate-200 pb-0">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`relative px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all
              ${activeTab === tab.key ? "text-slate-900 bg-white border border-b-white border-slate-200 -mb-px" : "text-slate-500 hover:text-slate-700"}`}>
            {tab.label}
            {tab.badge ? (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold animate-pulse">
                {tab.badge}
              </span>
            ) : null}
          </button>
        ))}
        <div className="ml-auto">
          <button onClick={loadData} className="text-xs text-slate-400 hover:text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            ↻ 刷新
          </button>
        </div>
      </div>

      {/* ═══════ 概览页 ═══════ */}
      {activeTab === "overview" && (
        <>
          {/* 紧急横幅(如有严重逾期) */}
          {smart && smart.overdue?.severe > 0 && (
            <div className="rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white p-4 flex items-center gap-3 shadow-lg shadow-red-500/20">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <div className="flex-1">
                <div className="font-semibold">{smart.overdue.severe} 笔严重逾期（超14天）需立即处理</div>
                <div className="text-sm text-white/80">逾期总额 €{fmt(smart.overdue.totalAmount)}，罚息 €{fmt(smart.overdue.totalPenalty)}</div>
              </div>
              <a href="/admin/repayments" className="px-4 py-2 bg-white text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors whitespace-nowrap">
                立即处理
              </a>
            </div>
          )}

          {/* 核心 KPI */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KpiCard title="今日放款" value={`€${fmt(data.todayDisbursement)}`}
              sub={`${data.todayDisbursementCount}笔 · 费用€${fmt(data.todayDisbursementFee)}`}
              icon={ICO.money} />
            <KpiCard title="今日收款" value={`€${fmt(data.todayRepayment)}`}
              sub={`${data.todayRepaymentCount}笔 · 利润€${fmt(data.todayRepaymentProfit)}`}
              icon={ICO.money} />
            <KpiCard title="在贷余额" value={`€${fmt(data.outstandingBalance)}`}
              sub={`${data.outstandingCount}笔活跃计划`}
              icon={ICO.bank} />
            <KpiCard title="资方余额" value={`€${fmt(data.funderBalance)}`}
              sub={`累计利润 €${fmt(data.funderTotalProfit)}`}
              icon={ICO.bank} />
          </div>

          {/* 智能待办列表 */}
          {smart?.smartTodos && smart.smartTodos.length > 0 && (
            <div className="stat-tile rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-slate-600">{ICO.spark}</span>
                <h3 className="text-sm font-semibold text-slate-700">智能待办</h3>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{smart.smartTodos.length} 项</span>
              </div>
              <div className="space-y-2">
                {smart.smartTodos.map((todo: any, i: number) => (
                  <a key={i} href={todo.href}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors group">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${urgencyDot[todo.urgency]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-700">{todo.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${urgencyStyle[todo.urgency]}`}>
                          {urgencyLabel[todo.urgency]}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{todo.description}</p>
                    </div>
                    <svg className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* 趋势图 + 健康度 */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="stat-tile rounded-xl p-5">
              <MiniBarChart data={data.disbursementTrend || []} valueKey="amount" label="近7天放款趋势" color="#3b82f6" />
            </div>
            <div className="stat-tile rounded-xl p-5">
              <MiniBarChart data={data.repaymentTrend || []} valueKey="amount" label="近7天收款趋势" color="#10b981" />
            </div>
            <div className="stat-tile rounded-xl p-5">
              <div className="text-xs font-medium text-slate-500 mb-3">资金健康度</div>
              <div className="flex items-center justify-around">
                <DonutRing value={Number(data.profitRate)} max={30} color="#8b5cf6" label={`利润率 ${data.profitRate}%`} />
                <DonutRing value={Number(data.turnoverRate)} max={10} color="#f59e0b" label={`周转率 ${data.turnoverRate}x`} />
                <DonutRing
                  value={data.settledCount} max={Math.max(data.totalDisbursedCount, 1)} color="#10b981"
                  label={`结清率 ${data.totalDisbursedCount > 0 ? ((data.settledCount / data.totalDisbursedCount) * 100).toFixed(0) : 0}%`}
                />
              </div>
            </div>
          </div>

          {/* 最近动态 */}
          <div className="grid gap-4 lg:grid-cols-2">
            <TimelineCard title="最近放款" items={(data.recentDisbursements || []).map((d: any) => ({
              id: d.id, label: d.disbursementNo, amount: d.amount, time: d.disbursedAt,
              sub: `实发 €${fmt(d.netAmount)} · 费用 €${fmt(d.feeAmount)}`,
            }))} color="blue" />
            <TimelineCard title="最近还款" items={(data.recentRepayments || []).map((r: any) => ({
              id: r.id, label: r.repaymentNo, amount: r.amount, time: r.receivedAt,
            }))} color="green" />
          </div>
        </>
      )}

      {/* ═══════ 智能预警页 ═══════ */}
      {activeTab === "smart" && smart && (
        <>
          {/* 业务健康评分 + 智能建议 */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="stat-tile rounded-xl p-5 flex flex-col items-center justify-center">
              <div className="text-xs font-medium text-slate-500 mb-2">业务健康评分</div>
              <HealthGauge score={smart.health?.score || 0} />
              <div className="flex gap-4 mt-3 text-xs text-slate-500">
                <span>准时率 <b className="text-slate-700">{smart.health?.onTimeRate}%</b></span>
                <span>逾期率 <b className={smart.health?.overdueRate > 10 ? "text-red-600" : "text-slate-700"}>{smart.health?.overdueRate}%</b></span>
              </div>
            </div>

            <div className="stat-tile rounded-xl p-5 lg:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-slate-600">{ICO.spark}</span>
                <h3 className="text-sm font-semibold text-slate-700">AI 分析建议</h3>
              </div>
              <div className="space-y-2">
                {(smart.health?.insights || []).map((tip: string, i: number) => (
                  <div key={i} className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">{tip}</div>
                ))}
              </div>
            </div>
          </div>

          {/* 到期预警卡片 */}
          <div className="grid gap-4 md:grid-cols-3">
            <AlertCard
              title="今日到期" count={smart.alerts?.dueToday?.length || 0}
              amount={smart.alerts?.dueTodayTotal || 0}
              color="red" items={smart.alerts?.dueToday || []} fmt={fmt}
            />
            <AlertCard
              title="3天内到期" count={smart.alerts?.due3Day?.length || 0}
              amount={smart.alerts?.due3DayTotal || 0}
              color="orange" items={smart.alerts?.due3Day || []} fmt={fmt}
            />
            <AlertCard
              title="7天内到期" count={smart.alerts?.due7Day?.length || 0}
              amount={smart.alerts?.due7DayTotal || 0}
              color="blue" items={smart.alerts?.due7Day || []} fmt={fmt}
            />
          </div>

          {/* 逾期跟踪 */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* 逾期分级 */}
            <div className="stat-tile rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-red-500">{ICO.warn}</span>
                <h3 className="text-sm font-semibold text-slate-700">逾期分级跟踪</h3>
                <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">{smart.overdue?.total || 0} 笔</span>
              </div>
              <div className="space-y-3">
                <OverdueLevel label="严重逾期 (>14天)" count={smart.overdue?.severe || 0} color="#ef4444" icon="🔴" desc="建议启动法务催收" />
                <OverdueLevel label="中度逾期 (8-14天)" count={smart.overdue?.moderate || 0} color="#f97316" icon="🟠" desc="建议电话催收+评估展期" />
                <OverdueLevel label="轻度逾期 (1-7天)" count={smart.overdue?.mild || 0} color="#eab308" icon="🟡" desc="宽限期内可短信提醒" />
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500">逾期总额</span> <b className="text-red-600 ml-2">€{fmt(smart.overdue?.totalAmount)}</b></div>
                <div><span className="text-slate-500">罚息累计</span> <b className="text-amber-600 ml-2">€{fmt(smart.overdue?.totalPenalty)}</b></div>
              </div>
            </div>

            {/* 逾期客户排行 */}
            <div className="stat-tile rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">逾期客户排行</h3>
              {(smart.overdue?.topCustomers || []).length === 0 ? (
                <div className="text-sm text-slate-400 py-8 text-center">暂无逾期客户 ✓</div>
              ) : (
                <div className="space-y-2">
                  {smart.overdue.topCustomers.slice(0, 6).map((c: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50">
                      <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center text-white
                        ${i < 3 ? "bg-red-500" : "bg-slate-400"}`}>{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-700 truncate">{c.name}</div>
                        <div className="text-[10px] text-slate-400">{c.phone} · {c.count}笔逾期 · 最长{c.maxDays}天</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-red-600">€{fmt(c.totalAmount)}</div>
                        <div className="text-[10px] text-slate-400">罚息 €{Number(c.totalPenalty).toFixed(0)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 逾期周趋势 */}
          {smart.overdue?.weekTrend && (
            <div className="stat-tile rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">近4周逾期新增趋势</h3>
              <div className="flex items-end gap-3 h-20">
                {["4周前", "3周前", "2周前", "本周"].map((label, i) => {
                  const val = smart.overdue.weekTrend[i] || 0;
                  const max = Math.max(...smart.overdue.weekTrend, 1);
                  return (
                    <div key={label} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs font-medium text-slate-600">{val}</span>
                      <div className="w-full rounded-t bg-red-400/80 transition-all" style={{ height: `${(val / max) * 100}%`, minHeight: 4 }} />
                      <span className="text-[10px] text-slate-400">{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════ 客户画像页 ═══════ */}
      {activeTab === "customers" && smart && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KpiCard title="客户总数" value={smart.customers?.total || 0} icon={ICO.users} />
            <KpiCard title="活跃借款" value={data.activeLoanCount}
              sub={`已结清 ${data.settledCount}笔`} icon={ICO.chart} />
            <KpiCard title="逾期客户" value={smart.overdue?.topCustomers?.length || 0}
              icon={ICO.warn} highlight={(smart.overdue?.topCustomers?.length || 0) > 0} />
            <KpiCard title="可复借客户" value={smart.customers?.potentialReborrow?.length || 0}
              sub="已结清无逾期" icon={ICO.profit} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* 风险等级分布 */}
            <div className="stat-tile rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-blue-500">{ICO.shield}</span>
                <h3 className="text-sm font-semibold text-slate-700">风险等级分布</h3>
              </div>
              <RiskBar dist={smart.customers?.riskDistribution || {}} total={smart.customers?.total || 0} />
            </div>

            {/* 客户价值分布 */}
            <div className="stat-tile rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">客户价值分级</h3>
              <ValueTierChart dist={smart.customers?.valueTierDistribution || {}} total={smart.customers?.total || 0} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* 高价值客户 */}
            <CustomerList title="💎 高价值客户" empty="暂无"
              customers={(smart.customers?.topBorrowers || []).map((c: any) => ({
                name: c.name, phone: c.phone,
                tag: c.valueTier, tagColor: "emerald",
                detail: `累计借款 €${fmt(c.totalBorrowed)}`,
                sub: `活跃 ${c.activeLoans} 笔 · ${c.riskLevel}`,
              }))} />

            {/* 风险客户 */}
            <CustomerList title="⚠️ 风险客户" empty="暂无风险客户 ✓"
              customers={(smart.customers?.riskCustomers || []).map((c: any) => ({
                name: c.name, phone: c.phone,
                tag: `逾期${c.overdueCount}笔`, tagColor: "red",
                detail: `累计借款 €${fmt(c.totalBorrowed)}`,
                sub: c.riskLevel,
              }))} />

            {/* 潜在复借 */}
            <CustomerList title="🔄 可复借客户" empty="暂无可复借客户"
              customers={(smart.customers?.potentialReborrow || []).map((c: any) => ({
                name: c.name, phone: c.phone,
                tag: `结清${c.settledLoans}笔`, tagColor: "blue",
                detail: `历史借款 €${fmt(c.totalBorrowed)}`,
                sub: "无逾期 · 可主动营销",
              }))} />
          </div>

          {/* 客户增长趋势 */}
          <div className="stat-tile rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">近4周新增客户趋势</h3>
            <div className="flex items-end gap-3 h-20">
              {["4周前", "3周前", "2周前", "本周"].map((label, i) => {
                const val = (smart.customers?.growthTrend || [])[i] || 0;
                const max = Math.max(...(smart.customers?.growthTrend || [0]), 1);
                return (
                  <div key={label} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs font-medium text-slate-600">{val}</span>
                    <div className="w-full rounded-t bg-blue-400/80 transition-all" style={{ height: `${(val / max) * 100}%`, minHeight: 4 }} />
                    <span className="text-[10px] text-slate-400">{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ═══════ 财务分析页 ═══════ */}
      {activeTab === "finance" && (
        <>
          {/* 核心财务 KPI */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KpiCard title="累计放款" value={`€${fmt(data.totalDisbursedAmount)}`}
              sub={`${data.totalDisbursedCount}笔`} icon={ICO.money} />
            <KpiCard title="累计收款" value={`€${fmt(data.totalRepaidAmount)}`}
              sub={`${data.totalRepaidCount}笔`} icon={ICO.money} />
            <KpiCard title="总利润" value={`€${fmt(data.totalProfit)}`}
              sub={`利润率 ${data.profitRate}%`} icon={ICO.profit} />
            <KpiCard title="资金周转率" value={`${data.turnoverRate}x`}
              sub={`结清 ${data.settledCount}笔`} icon={ICO.chart} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* 收入结构 */}
            <div className="stat-tile rounded-xl p-5">
              <div className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">{ICO.bank} 收入结构明细</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <Row label="砍头费收入" value={`€${fmt(data.totalDisbursedFee)}`} accent="text-emerald-600" />
                <Row label="实际出借" value={`€${fmt(data.totalDisbursedNet)}`} />
                <Row label="收回本金" value={`€${fmt(data.totalRepaidPrincipal)}`} />
                <Row label="利息收入" value={`€${fmt(data.totalRepaidInterest)}`} accent="text-emerald-600" />
                <Row label="费用收入" value={`€${fmt(data.totalRepaidFee)}`} accent="text-emerald-600" />
                <Row label="罚息收入" value={`€${fmt(data.totalRepaidPenalty)}`} accent="text-amber-600" />
                <Row label="逾期未收" value={`€${fmt(data.overdueAmount)}`} accent="text-red-600" />
                <Row label="7天内到期" value={`€${fmt(data.upcomingDue7d)}`} highlight />
              </div>
            </div>

            {/* 砍头息利润 */}
            <div className="stat-tile rounded-xl p-5">
              <div className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">{ICO.profit} 砍头息利润模型</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <Row label="砍头差额(放款-实发)" value={`€${fmt(data.upfrontProfit)}`} accent="text-emerald-600" />
                <Row label="还款利润(息+费+罚)" value={`€${fmt(data.repaymentProfit)}`} accent="text-emerald-600" />
                <div className="col-span-2 border-t border-slate-100 my-1" />
                <Row label="总利润" value={`€${fmt(data.totalProfit)}`} accent="text-emerald-700 font-bold" />
                <Row label="综合利润率" value={`${data.profitRate}%`} accent="text-blue-600 font-bold" />
                <Row label="资金周转率" value={`${data.turnoverRate}x`} />
                <Row label="逾期罚息贡献" value={`€${fmt(data.totalPenaltyIncome)}`} />
              </div>
              <div className="mt-4 bg-amber-50 border border-amber-100 rounded-lg p-3">
                <div className="text-xs font-semibold text-amber-800 mb-1">利益最大化建议</div>
                <ul className="text-xs text-amber-700 space-y-1 list-disc pl-4">
                  {profitTips.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            </div>
          </div>

          {/* 趋势图 */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="stat-tile rounded-xl p-5">
              <MiniBarChart data={data.disbursementTrend || []} valueKey="amount" label="近7天放款趋势" color="#3b82f6" />
            </div>
            <div className="stat-tile rounded-xl p-5">
              <MiniBarChart data={data.repaymentTrend || []} valueKey="amount" label="近7天收款趋势" color="#10b981" />
            </div>
          </div>
        </>
      )}

    </div>
  );
}

/* ═══ 辅助子组件 ═══ */
function Row({ label, value, sub, highlight, accent }: {
  label: string; value: string; sub?: string; highlight?: boolean; accent?: string;
}) {
  return (
    <div className={`flex justify-between items-baseline py-0.5 ${highlight ? "bg-amber-50/60 -mx-1 px-1 rounded" : ""}`}>
      <span className="text-slate-500">{label}</span>
      <span className={accent || "text-slate-800 font-medium"}>
        {value}
        {sub && <span className="text-[10px] text-slate-400 ml-1">{sub}</span>}
      </span>
    </div>
  );
}

function TimelineCard({ title, items, color }: {
  title: string;
  items: { id: string; label: string; amount: any; time: string; sub?: string }[];
  color: "blue" | "green";
}) {
  const dotColor = color === "blue" ? "bg-blue-400" : "bg-emerald-400";
  return (
    <div className="stat-tile rounded-xl p-5">
      <div className="text-sm font-semibold text-slate-700 mb-3">{title}</div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">暂无记录</p>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <div key={it.id} className="flex items-start gap-3">
              <div className={`w-2 h-2 rounded-full mt-1.5 ${dotColor}`} />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-700 truncate">{it.label}</span>
                  <span className="text-slate-800 font-medium whitespace-nowrap">€{Number(it.amount).toFixed(2)}</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {new Date(it.time).toLocaleString("zh-CN")}
                  {it.sub && ` · ${it.sub}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── 到期预警卡 ─── */
function AlertCard({ title, count, amount, color, items, fmt }: {
  title: string; count: number; amount: number;
  color: "red" | "orange" | "blue";
  items: any[]; fmt: (v: any) => string;
}) {
  const colorMap = {
    red: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", badge: "bg-red-500", ring: "ring-red-100" },
    orange: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", badge: "bg-orange-500", ring: "ring-orange-100" },
    blue: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", badge: "bg-blue-500", ring: "ring-blue-100" },
  };
  const c = colorMap[color];
  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-5`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-sm font-semibold ${c.text}`}>{title}</h3>
        <span className={`${c.badge} text-white text-xs font-bold px-2 py-0.5 rounded-full`}>{count}</span>
      </div>
      <div className={`text-2xl font-bold ${c.text} mb-1`}>€{fmt(amount)}</div>
      <div className="text-xs text-slate-500">{count > 0 ? `${count} 笔待回收` : "暂无到期"}</div>
      {items.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-200/50 space-y-1.5">
          {items.slice(0, 3).map((item: any) => (
            <div key={item.id} className="flex justify-between text-xs">
              <span className="text-slate-600">第{item.periodNumber}期</span>
              <span className="font-medium text-slate-700">€{Number(item.amount).toFixed(0)}</span>
            </div>
          ))}
          {items.length > 3 && <div className="text-[10px] text-slate-400 text-center">还有 {items.length - 3} 笔...</div>}
        </div>
      )}
    </div>
  );
}

/* ─── 逾期等级行 ─── */
function OverdueLevel({ label, count, color, icon, desc }: {
  label: string; count: number; color: string; icon: string; desc: string;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/70 border border-slate-100">
      <span className="text-lg">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-700">{label}</div>
        <div className="text-[10px] text-slate-400">{desc}</div>
      </div>
      <div className="text-right">
        <span className="text-lg font-bold" style={{ color }}>{count}</span>
        <span className="text-xs text-slate-400 ml-1">笔</span>
      </div>
    </div>
  );
}

/* ─── 风险分布条形图 ─── */
function RiskBar({ dist, total }: { dist: Record<string, number>; total: number }) {
  const levels = [
    { key: "LOW", label: "低风险", color: "#10b981" },
    { key: "NORMAL", label: "正常", color: "#3b82f6" },
    { key: "MEDIUM", label: "中风险", color: "#f59e0b" },
    { key: "HIGH", label: "高风险", color: "#ef4444" },
  ];
  return (
    <div className="space-y-2">
      {levels.map((l) => (
        <HorizontalBar key={l.key} label={l.label} value={dist[l.key] || 0} total={total} color={l.color} />
      ))}
    </div>
  );
}

/* ─── 客户价值分布 ─── */
function ValueTierChart({ dist, total }: { dist: Record<string, number>; total: number }) {
  const tiers = [
    { key: "优质客户", color: "#10b981" },
    { key: "良好客户", color: "#3b82f6" },
    { key: "正常客户", color: "#6366f1" },
    { key: "新客户", color: "#8b5cf6" },
    { key: "潜在客户", color: "#a78bfa" },
    { key: "风险客户", color: "#ef4444" },
    { key: "拒绝客户", color: "#94a3b8" },
  ];
  const activeTiers = tiers.filter((t) => (dist[t.key] || 0) > 0);
  return (
    <div className="space-y-2">
      {activeTiers.map((t) => (
        <HorizontalBar key={t.key} label={t.key} value={dist[t.key] || 0} total={total} color={t.color} />
      ))}
      {activeTiers.length === 0 && <div className="text-sm text-slate-400 text-center py-4">暂无数据</div>}
    </div>
  );
}

/* ─── 客户列表卡 ─── */
function CustomerList({ title, customers, empty }: {
  title: string; empty: string;
  customers: { name: string; phone: string; tag: string; tagColor: string; detail: string; sub: string }[];
}) {
  const tagColors: Record<string, string> = {
    emerald: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-700",
  };
  return (
    <div className="stat-tile rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">{title}</h3>
      {customers.length === 0 ? (
        <div className="text-sm text-slate-400 text-center py-6">{empty}</div>
      ) : (
        <div className="space-y-2.5">
          {customers.map((c, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0 mt-0.5">
                {c.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">{c.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${tagColors[c.tagColor] || tagColors.blue}`}>{c.tag}</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{c.detail}</div>
                <div className="text-[10px] text-slate-400">{c.phone} · {c.sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
