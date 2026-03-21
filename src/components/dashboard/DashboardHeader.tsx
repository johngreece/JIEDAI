"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const QUICK_ACTIONS = [
  { label: "新增客户", href: "/admin/register" },
  { label: "借款申请", href: "/admin/loan-applications" },
  { label: "放款管理", href: "/admin/disbursements" },
  { label: "还款核销", href: "/admin/repayments" },
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
    <header className="panel-soft rounded-2xl px-5 py-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-sm text-slate-500">智能运营中台</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {now ? getGreeting(now.getHours()) : "你好"}，{username}
            </h1>
          </div>
          {now ? (
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <span>{formatDate(now)}</span>
              <span className="hidden text-slate-300 sm:inline">|</span>
              <span className="font-mono text-slate-700">{formatTime(now)}</span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:no-underline"
            >
              {action.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}
