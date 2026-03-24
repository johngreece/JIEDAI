"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import Sidebar from "@/components/admin/Sidebar";

type AdminMainLayoutProps = {
  children: ReactNode;
};

export default function AdminMainLayout({ children }: AdminMainLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const pageMeta = useMemo(() => {
    const titleMap: Record<string, string> = {
      dashboard: "首页工作台",
      finance: "财务系统",
      "launch-readiness": "上线检查",
      customers: "客户管理",
      "loan-applications": "借款申请",
      disbursements: "放款管理",
      repayments: "还款管理",
      "repayment-plans": "还款计划",
      overdue: "逾期管理",
      settlement: "结算中心",
      ledger: "资金台账",
      funders: "资金方",
      "funder-withdrawals": "资金方提现",
      users: "用户管理",
      roles: "角色管理",
      products: "产品配置",
      templates: "模板中心",
      extensions: "展期管理",
      restructures: "重组管理",
      "audit-logs": "审计日志",
      register: "新增客户",
    };

    const parts = pathname.split("/").filter(Boolean).slice(1);
    const labels = parts.map((part) => titleMap[part] ?? part);

    return {
      crumbs: ["管理后台", ...labels],
      current: labels[labels.length - 1] ?? "首页工作台",
      section: labels[0] ?? "管理后台",
      today: new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
      }).format(new Date()),
    };
  }, [pathname]);

  useEffect(() => {
    const syncLayout = () => {
      const width = window.innerWidth;
      setCollapsed(width < 1440);
      if (width >= 1100) {
        setMobileOpen(false);
      }
    };

    syncLayout();
    window.addEventListener("resize", syncLayout);
    return () => window.removeEventListener("resize", syncLayout);
  }, []);

  return (
    <div className="admin-workspace-shell">
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onToggleCollapse={() => setCollapsed((current) => !current)}
      />

      <div className="admin-workspace-main">
        <div className="admin-workspace-topbar">
          <div className="admin-topbar-shell">
            <div className="admin-topbar-copy">
              <div className="admin-breadcrumbs">
                {pageMeta.crumbs.map((crumb, index) => (
                  <span key={`${crumb}-${index}`} className="admin-breadcrumbs__item">
                    {index > 0 ? <span className="admin-breadcrumbs__sep">/</span> : null}
                    <span>{crumb}</span>
                  </span>
                ))}
              </div>
              <div className="admin-topbar-heading">
                <h1 className="admin-topbar-heading__title">{pageMeta.current}</h1>
                <p className="admin-topbar-heading__meta">
                  {pageMeta.section} · 今日 {pageMeta.today}
                </p>
              </div>
            </div>

            <div className="admin-topbar-actions">
              <div className="admin-topbar-chip">
                <span className="admin-topbar-chip__dot" />
                系统在线
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="admin-btn admin-btn-secondary admin-btn-sm lg:hidden"
              >
                菜单
              </button>
              <button
                type="button"
                onClick={() => setCollapsed((current) => !current)}
                className="admin-btn admin-btn-secondary admin-btn-sm hidden lg:inline-flex"
              >
                {collapsed ? "展开导航" : "收起导航"}
              </button>
            </div>
          </div>
        </div>

        <main className="admin-content-stage">
          <div className="admin-content-backdrop" />
          <div className="admin-content-inner">
            <div className="relative z-[1]">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
