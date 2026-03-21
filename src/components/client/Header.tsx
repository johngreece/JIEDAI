"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CompanyLogo } from "@/components/CompanyLogo";

const MenuIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const CloseIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const LogoutIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

export function ClientHeader({ username }: { username: string }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/client/notifications?limit=1")
      .then((response) => response.json())
      .then((data) => setUnread(data.unread ?? 0))
      .catch(() => {});
  }, [pathname]);

  const navigation = [
    { name: "我的借款", href: "/client/dashboard" },
    { name: "我的还款", href: "/client/repayments" },
    { name: "还款计划", href: "/client/repayment-plans" },
    { name: "我的证件", href: "/client/documents" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-7xl items-center justify-between p-4 lg:px-8" aria-label="Global">
        <div className="flex lg:flex-1">
          <Link href="/client/dashboard" className="-m-1.5 flex items-center gap-2 p-1.5">
            <CompanyLogo size={32} />
            <span className="font-semibold text-slate-100">借款中心</span>
          </Link>
        </div>

        <div className="flex lg:hidden">
          <button
            type="button"
            className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-slate-200 hover:bg-white/10"
            onClick={() => setMobileMenuOpen(true)}
          >
            <span className="sr-only">Open main menu</span>
            <MenuIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="hidden lg:flex lg:gap-x-8">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`text-sm font-semibold leading-6 transition-colors ${
                pathname === item.href ? "text-cyan-200" : "text-slate-100 hover:text-cyan-200"
              }`}
            >
              {item.name}
            </Link>
          ))}
          <Link
            href="/client/notifications"
            className={`relative text-sm font-semibold leading-6 transition-colors ${
              pathname === "/client/notifications" ? "text-cyan-200" : "text-slate-100 hover:text-cyan-200"
            }`}
          >
            消息提醒
            {unread > 0 ? (
              <span className="absolute -right-3 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </Link>
        </div>

        <div className="hidden items-center gap-4 lg:flex lg:flex-1 lg:justify-end">
          <div className="text-sm font-medium text-slate-200/90">{username}</div>
          <Link href="/client/login" className="flex items-center gap-1 text-sm font-semibold leading-6 text-slate-300 hover:text-white">
            退出
            <LogoutIcon className="h-4 w-4" />
          </Link>
        </div>
      </nav>

      {mobileMenuOpen ? (
        <div className="lg:hidden" role="dialog" aria-modal="true">
          <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto border-l border-white/10 bg-slate-950/90 px-6 py-6 text-slate-100 backdrop-blur-xl sm:max-w-sm sm:ring-1 sm:ring-white/10 shadow-xl">
            <div className="flex items-center justify-between">
              <Link href="/client/dashboard" className="-m-1.5 flex items-center gap-2 p-1.5">
                <CompanyLogo size={32} />
                <span className="font-bold text-slate-100">借款中心</span>
              </Link>
              <button
                type="button"
                className="-m-2.5 rounded-md p-2.5 text-slate-200 hover:bg-white/10"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="sr-only">Close menu</span>
                <CloseIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="mt-6 flow-root">
              <div className="-my-6 divide-y divide-white/10">
                <div className="space-y-2 py-6">
                  {navigation.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      className="-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-slate-100 hover:bg-white/10"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {item.name}
                    </Link>
                  ))}
                  <Link
                    href="/client/notifications"
                    className="-mx-3 flex items-center justify-between rounded-lg px-3 py-2 text-base font-semibold leading-7 text-slate-100 hover:bg-white/10"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <span>消息提醒</span>
                    {unread > 0 ? (
                      <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    ) : null}
                  </Link>
                </div>
                <div className="py-6">
                  <div className="mb-4 flex items-center gap-3 px-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-slate-200 ring-1 ring-white/15">
                      {username.charAt(0)}
                    </div>
                    <span className="font-medium text-slate-100">{username}</span>
                  </div>
                  <Link
                    href="/client/login"
                    className="-mx-3 block rounded-lg px-3 py-2.5 text-base font-semibold leading-7 text-slate-100 hover:bg-white/10"
                  >
                    退出登录
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
