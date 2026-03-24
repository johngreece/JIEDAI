"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const QUICK_ACTIONS = [
  { label: "新增客户", href: "/admin/register" },
  { label: "借款申请", href: "/admin/loan-applications" },
  { label: "放款管理", href: "/admin/disbursements" },
  { label: "还款核销", href: "/admin/repayments" },
  { label: "财务中心", href: "/admin/finance" },
  { label: "录入入金", href: "/admin/funders" },
];

function getGreeting(hour: number) {
  if (hour < 6) return "夜深了";
  if (hour < 12) return "上午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function formatDate(date: Date) {
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function DashboardHeader({ username }: { username: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="panel-soft rounded-[26px] px-5 py-4 xl:px-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(520px,1fr)] xl:items-center">
        <div className="min-w-0">
          <div>
            <p className="text-sm font-medium text-slate-500">智能运营中台</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {now ? getGreeting(now.getHours()) : "你好"}，{username}
            </h1>
          </div>
          {now ? (
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <span>{formatDate(now)}</span>
              <span className="hidden text-slate-300 sm:inline">|</span>
              <span className="font-mono text-slate-700">{formatTime(now)}</span>
              <span className="hidden text-slate-300 xl:inline">|</span>
              <span>宽屏运营视图已启用</span>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
              借款、还款、逾期同屏处理
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
              财务入金与结算直达
            </span>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:no-underline"
            >
              {action.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}
