"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 6) return "夜深了";
  if (h < 12) return "早上好";
  if (h < 18) return "下午好";
  return "晚上好";
}

function formatDate(d: Date) {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`;
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

const QUICK_ACTIONS = [
  { label: "新增客户", href: "/admin/register", color: "bg-blue-600 hover:bg-blue-700", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg> },
  { label: "创建借款", href: "/admin/loan-applications", color: "bg-emerald-600 hover:bg-emerald-700", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
  { label: "确认放款", href: "/admin/disbursements", color: "bg-amber-600 hover:bg-amber-700", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2m0-6h2a2 2 0 012 2v2a2 2 0 01-2 2h-2m0-6a2 2 0 012 2v2a2 2 0 01-2 2m-5-3h.01" /></svg> },
  { label: "还款登记", href: "/admin/repayments", color: "bg-violet-600 hover:bg-violet-700", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l2 2 4-4m3 8H6a2 2 0 01-2-2V5a2 2 0 012-2h8.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V20a2 2 0 01-2 2z" /></svg> },
];

export function DashboardHeader({ username }: { username: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="panel-soft rounded-2xl px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* 左：问候 + 日期时间 */}
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">工作台</h1>
            <p className="mt-1 text-sm text-slate-600">
              {now ? getGreeting() : "你好"}，{username}。
            </p>
          </div>
          {now && (
            <div className="hidden sm:flex items-center gap-3 ml-4 pl-4 border-l border-slate-200">
              <div className="text-right">
                <div className="text-xs text-slate-400">{formatDate(now)}</div>
                <div className="text-lg font-mono font-bold text-slate-700 tabular-nums tracking-wider">{formatTime(now)}</div>
              </div>
            </div>
          )}
        </div>

        {/* 右：快捷操作 */}
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_ACTIONS.map((a) => (
            <Link key={a.label} href={a.href}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-white shadow-sm transition ${a.color}`}>
              {a.icon}
              <span className="hidden md:inline">{a.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}
