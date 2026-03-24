"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type SidebarProps = {
  collapsed: boolean;
  mobileOpen: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
};

type NavItem = {
  href: string;
  label: string;
  badge?: string;
  short: string;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: "工作台",
    items: [
      { href: "/admin/dashboard", label: "首页工作台", short: "工" },
      { href: "/admin/finance", label: "财务系统", short: "财" },
      { href: "/admin/launch-readiness", label: "上线检查", short: "检" },
    ],
  },
  {
    title: "业务流程",
    items: [
      { href: "/admin/customers", label: "客户管理", short: "客" },
      { href: "/admin/loan-applications", label: "借款申请", short: "借" },
      { href: "/admin/disbursements", label: "放款管理", short: "放" },
      { href: "/admin/repayments", label: "还款管理", short: "还" },
      { href: "/admin/repayment-plans", label: "还款计划", short: "计" },
      { href: "/admin/overdue", label: "逾期管理", short: "逾" },
      { href: "/admin/settlement", label: "结算中心", short: "结" },
    ],
  },
  {
    title: "资金管理",
    items: [
      { href: "/admin/ledger", label: "资金台账", short: "账" },
      { href: "/admin/funders", label: "资金方", short: "资" },
      { href: "/admin/funder-withdrawals", label: "资金方提现", short: "提" },
    ],
  },
  {
    title: "配置权限",
    items: [
      { href: "/admin/users", label: "用户管理", short: "户" },
      { href: "/admin/roles", label: "角色管理", short: "角" },
      { href: "/admin/products", label: "产品配置", short: "产" },
      { href: "/admin/templates", label: "模板中心", short: "模" },
      { href: "/admin/extensions", label: "展期管理", short: "展" },
      { href: "/admin/restructures", label: "重组管理", short: "重" },
      { href: "/admin/audit-logs", label: "审计日志", short: "审" },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin/dashboard") {
    return pathname === "/admin" || pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar({ collapsed, mobileOpen, onClose, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-950/24 backdrop-blur-sm transition-opacity duration-200 lg:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      <aside
        data-admin-sidebar
        className={`admin-sidebar-surface fixed inset-y-4 left-4 z-50 flex flex-col overflow-hidden transition-all duration-300 lg:sticky lg:top-4 lg:z-30 lg:h-[calc(100vh-2rem)] ${
          collapsed ? "w-[92px]" : "w-[224px]"
        } ${
          mobileOpen ? "translate-x-0" : "-translate-x-[120%] lg:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/65 px-4 py-4">
          <div className={`min-w-0 ${collapsed ? "mx-auto" : ""}`}>
            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-400">Daikuan</div>
            {!collapsed ? <div className="mt-1 text-sm font-semibold text-slate-900">Management Hub</div> : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleCollapse}
              className="hidden rounded-full border border-slate-200/90 bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-white lg:inline-flex"
            >
              {collapsed ? ">" : "<"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200/90 bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-white lg:hidden"
            >
              关闭
            </button>
          </div>
        </div>

        <div className="px-3 pt-3">
          <div className={`rounded-[1.35rem] border border-white/70 bg-white/72 px-3 py-3 shadow-[0_10px_26px_rgba(15,23,42,0.05)] ${collapsed ? "text-center" : ""}`}>
            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Workspace</div>
            {!collapsed ? (
              <>
                <div className="mt-1 text-sm font-semibold text-slate-900">统一业务中台</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">借款、还款、逾期、财务与权限配置统一管理。</div>
              </>
            ) : (
              <div className="mt-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                管
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-4">
            {NAV_GROUPS.map((group) => (
              <section
                key={group.title}
                className="rounded-[1.35rem] border border-white/70 bg-white/68 p-2.5 shadow-[0_10px_26px_rgba(15,23,42,0.05)] backdrop-blur-xl"
              >
                {!collapsed ? (
                  <div className="mb-2 px-2 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    {group.title}
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  {group.items.map((item) => {
                    const active = isActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        className={`group flex items-center gap-3 rounded-[1.15rem] px-2.5 py-2.5 text-sm font-medium transition ${
                          active
                            ? "bg-slate-900 text-white shadow-[0_12px_24px_rgba(15,23,42,0.16)]"
                            : "text-slate-600 hover:bg-white hover:text-slate-900"
                        } ${collapsed ? "justify-center px-2" : ""}`}
                        title={collapsed ? item.label : undefined}
                      >
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition ${
                            active
                              ? "border-white/20 bg-white/10 text-white"
                              : "border-slate-200 bg-slate-50 text-slate-600 group-hover:bg-slate-100"
                          }`}
                        >
                          {item.short}
                        </span>
                        {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
                        {!collapsed && item.badge ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[0.68rem] ${
                              active ? "bg-white/10 text-white" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}
