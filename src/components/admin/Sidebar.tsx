"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { CompanyLogo } from "@/components/CompanyLogo";

/* ─── SVG 图标 ─── */
const I = {
  home: (c?: string) => <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  users: (c?: string) => <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
  doc: (c?: string) => <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  cash: (c?: string) => <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2m0-6h2a2 2 0 012 2v2a2 2 0 01-2 2h-2m0-6a2 2 0 012 2v2a2 2 0 01-2 2m-5-3h.01" /></svg>,
  receipt: (c?: string) => <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l2 2 4-4m3 8H6a2 2 0 01-2-2V5a2 2 0 012-2h8.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V20a2 2 0 01-2 2z" /></svg>,
  cog: (c?: string) => <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  logout: (c?: string) => <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
  warn: (c?: string) => <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
  fund: (c?: string) => <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>,
  chart: (c?: string) => <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
  calendar: (c?: string) => <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>,
  shield: (c?: string) => <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>,
  chevDown: (c?: string) => <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>,
};

type NavItem = { name: string; href: string; icon: (c?: string) => React.ReactNode };
type NavGroup = { label: string; icon: (c?: string) => React.ReactNode; items: NavItem[] };

export function AdminSidebar({ userRole, username }: { userRole?: string[]; username: string }) {
  const pathname = usePathname();
  const router = useRouter();

  /* ─── 分组导航 ─── */
  const groups: NavGroup[] = [
    {
      label: "总览",
      icon: I.home,
      items: [
        { name: "工作台", href: "/admin/dashboard", icon: I.home },
        { name: "系统告警", href: "/admin/notifications", icon: I.warn },
      ],
    },
    {
      label: "核心业务",
      icon: I.doc,
      items: [
        { name: "客户管理", href: "/admin/customers", icon: I.users },
        { name: "客户登记", href: "/admin/register", icon: I.users },
        { name: "借款申请", href: "/admin/loan-applications", icon: I.doc },
        { name: "放款管理", href: "/admin/disbursements", icon: I.cash },
        { name: "还款管理", href: "/admin/repayments", icon: I.receipt },
        { name: "还款计划", href: "/admin/repayment-plans", icon: I.calendar },
      ],
    },
    {
      label: "风险管控",
      icon: I.shield,
      items: [
        { name: "展期管理", href: "/admin/extensions", icon: I.doc },
        { name: "贷款重组", href: "/admin/restructures", icon: I.doc },
        { name: "逾期管理", href: "/admin/overdue", icon: I.warn },
      ],
    },
    {
      label: "资金管理",
      icon: I.fund,
      items: [
        { name: "台账查询", href: "/admin/ledger", icon: I.cash },
        { name: "财务结算", href: "/admin/settlement", icon: I.chart },
        { name: "资金方", href: "/admin/funders", icon: I.fund },
        { name: "提现审批", href: "/admin/funder-withdrawals", icon: I.receipt },
      ],
    },
    {
      label: "配置中心",
      icon: I.cog,
      items: [
        { name: "贷款产品", href: "/admin/products", icon: I.cog },
        { name: "合同模板", href: "/admin/templates", icon: I.doc },
      ],
    },
  ];

  if (userRole?.includes("super_admin")) {
    groups.push({
      label: "系统管理",
      icon: I.shield,
      items: [
        { name: "用户管理", href: "/admin/users", icon: I.users },
        { name: "角色管理", href: "/admin/roles", icon: I.cog },
        { name: "审计日志", href: "/admin/audit-logs", icon: I.receipt },
        { name: "系统配置", href: "/admin/settings/loan-fee", icon: I.cog },
      ],
    });
  }

  /* ─── 折叠状态 (除"总览"默认展开，其它按当前路由自动展开) ─── */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    groups.forEach((g) => {
      const hasActive = g.items.some((i) => pathname === i.href || pathname?.startsWith(i.href + "/"));
      init[g.label] = !hasActive && g.label !== "总览";
    });
    return init;
  });

  const toggle = (label: string) => setCollapsed((p) => ({ ...p, [label]: !p[label] }));

  const handleLogout = async () => {
    await fetch("/api/auth/admin/login", { method: "DELETE" }).catch(() => {});
    router.push("/admin/login");
  };

  return (
    <div className="flex grow flex-col gap-y-3 overflow-y-auto border-r border-white/10 bg-slate-950/80 px-4 pb-4 backdrop-blur-xl scrollbar-thin">
      {/* ━━━ Logo ━━━ */}
      <div className="mt-3 flex h-14 shrink-0 items-center justify-center border-b border-white/10">
        <Link href="/" className="flex items-center gap-2 font-semibold text-white text-lg tracking-wide hover:opacity-90 transition-opacity">
          <CompanyLogo size={30} />
          <span>财大气粗</span>
        </Link>
      </div>

      {/* ━━━ 导航 ━━━ */}
      <nav className="mt-1 flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-y-1">
          {groups.map((group) => {
            const isOpen = !collapsed[group.label];
            const hasActive = group.items.some((i) => pathname === i.href || pathname?.startsWith(i.href + "/"));
            return (
              <div key={group.label}>
                {/* 分组标题 */}
                <button
                  onClick={() => toggle(group.label)}
                  className={`w-full flex items-center gap-2 px-2 py-2 text-[11px] font-bold uppercase tracking-[0.12em] rounded-md transition-colors
                    ${hasActive ? "text-cyan-300" : "text-slate-500 hover:text-slate-300"}`}
                >
                  <span className="w-4 h-4 shrink-0 opacity-60">{group.icon("w-4 h-4")}</span>
                  <span className="flex-1 text-left">{group.label}</span>
                  <span className={`w-4 h-4 transition-transform duration-200 ${isOpen ? "" : "-rotate-90"}`}>
                    {I.chevDown("w-3.5 h-3.5")}
                  </span>
                </button>

                {/* 菜单项 */}
                <div className={`overflow-hidden transition-all duration-200 ${isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}>
                  <ul className="ml-2 space-y-0.5 border-l border-white/5 pl-2 pb-1">
                    {group.items.map((item) => {
                      const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
                      return (
                        <li key={item.name}>
                          <Link
                            href={item.href}
                            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-all duration-150
                              ${isActive
                                ? "bg-white/15 text-white shadow-sm shadow-cyan-500/10"
                                : "text-slate-400 hover:bg-white/8 hover:text-slate-200"}`}
                          >
                            <span className="w-4 h-4 shrink-0 opacity-70">{item.icon("w-4 h-4")}</span>
                            {item.name}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        {/* ━━━ 用户栏 ━━━ */}
        <div className="mt-auto pt-3 border-t border-white/10">
          <div className="flex items-center gap-x-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-medium text-white backdrop-blur-sm">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-xs font-bold text-white ring-2 ring-cyan-400/30">
              {username ? username.charAt(0).toUpperCase() : "A"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm">{username}</div>
              <div className="text-[10px] text-slate-500">{userRole?.includes("super_admin") ? "超级管理员" : "操作员"}</div>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-red-500/20 hover:text-red-400"
              title="退出登录"
            >
              {I.logout("h-4 w-4")}
            </button>
          </div>
        </div>
      </nav>
    </div>
  );
}
