"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function FunderHeader({ username }: { username: string }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/funder/notifications?limit=1")
      .then((r) => r.json())
      .then((d) => setUnread(d.unread ?? 0))
      .catch(() => {});
  }, [pathname]);

  const navigation = [
    { name: "投资概览", href: "/funder/dashboard" },
    { name: "放款明细", href: "/funder/disbursements" },
    { name: "提现管理", href: "/funder/withdrawals" },
    { name: "对账单", href: "/funder/statements" },
    { name: "合作协议", href: "/funder/contracts" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-7xl items-center justify-between p-4 lg:px-8">
        <div className="flex lg:flex-1">
          <Link href="/funder/dashboard" className="-m-1.5 p-1.5 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200/30 bg-emerald-300/20 text-xs font-semibold text-emerald-100">FD</div>
            <span className="font-semibold text-slate-100">资金方中心</span>
          </Link>
        </div>

        {/* Mobile */}
        <div className="flex lg:hidden">
          <button
            type="button"
            className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-slate-200 hover:bg-white/10"
            onClick={() => setMobileMenuOpen(true)}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Desktop Nav */}
        <div className="hidden lg:flex lg:gap-x-8">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`text-sm font-semibold leading-6 transition-colors ${
                pathname === item.href ? "text-emerald-200" : "text-slate-100 hover:text-emerald-200"
              }`}
            >
              {item.name}
            </Link>
          ))}
          <Link
            href="/funder/notifications"
            className={`relative text-sm font-semibold leading-6 transition-colors ${
              pathname === "/funder/notifications" ? "text-emerald-200" : "text-slate-100 hover:text-emerald-200"
            }`}
          >
            通知
            {unread > 0 && (
              <span className="absolute -right-3 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
        </div>

        {/* Desktop User */}
        <div className="hidden lg:flex lg:flex-1 lg:justify-end items-center gap-4">
          <div className="text-sm font-medium text-slate-200/90">{username}</div>
          <Link href="/funder/login" className="text-sm font-semibold leading-6 text-slate-300 hover:text-white flex items-center gap-1">
            退出
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </Link>
        </div>
      </nav>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden">
          <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto border-l border-white/10 bg-slate-950/90 px-6 py-6 text-slate-100 backdrop-blur-xl sm:max-w-sm shadow-xl">
            <div className="flex items-center justify-between">
              <Link href="/funder/dashboard" className="-m-1.5 p-1.5 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200/30 bg-emerald-300/20 text-xs font-semibold text-emerald-100">FD</div>
                <span className="font-bold text-slate-100">资金方中心</span>
              </Link>
              <button type="button" className="-m-2.5 rounded-md p-2.5 text-slate-200 hover:bg-white/10" onClick={() => setMobileMenuOpen(false)}>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mt-6 space-y-2">
              {navigation.map((item) => (
                <Link key={item.name} href={item.href} className="-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-slate-100 hover:bg-white/10" onClick={() => setMobileMenuOpen(false)}>
                  {item.name}
                </Link>
              ))}
            </div>
            <div className="mt-6 border-t border-white/10 pt-6">
              <div className="mb-4 px-3 font-medium text-slate-100">{username}</div>
              <Link href="/funder/login" className="-mx-3 block rounded-lg px-3 py-2.5 text-base font-semibold leading-7 text-slate-100 hover:bg-white/10">退出登录</Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
