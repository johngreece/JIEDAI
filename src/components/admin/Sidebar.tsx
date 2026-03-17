"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Simple icon implementations to avoid dependencies
const HomeIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const UsersIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const DocIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const CashIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2m0-6h2a2 2 0 012 2v2a2 2 0 01-2 2h-2m0-6a2 2 0 012 2v2a2 2 0 01-2 2m-5-3h.01" />
  </svg>
);

const ReceiptIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l2 2 4-4m3 8H6a2 2 0 01-2-2V5a2 2 0 012-2h8.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V20a2 2 0 01-2 2z" />
  </svg>
);

const CogIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const LogoutIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export function AdminSidebar({ userRole, username }: { userRole?: string[], username: string }) {
  const pathname = usePathname();

  const navigation = [
    { name: "工作台", href: "/admin/dashboard", icon: HomeIcon },
    { name: "客户管理", href: "/admin/register", icon: UsersIcon },
    { name: "借款申请", href: "/admin/loan-applications", icon: DocIcon },
    { name: "放款管理", href: "/admin/disbursements", icon: CashIcon },
    { name: "还款管理", href: "/admin/repayments", icon: ReceiptIcon },
  ];

  if (userRole?.includes("super_admin")) {
    navigation.push({ name: "系统配置", href: "/admin/settings/loan-fee", icon: CogIcon });
  }

  return (
    <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-slate-900 px-6 pb-4">
      <div className="flex h-16 shrink-0 items-center justify-center border-b border-slate-800">
        <Link href="/" className="flex items-center gap-2 font-bold text-white text-xl tracking-wider hover:opacity-80 transition-opacity">
           <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center text-sm shadow-md shadow-blue-500/20">D</div>
           <span>DAIKUAN</span>
        </Link>
      </div>
      <nav className="flex flex-1 flex-col mt-4">
        <ul role="list" className="flex flex-1 flex-col gap-y-7">
          <li>
            <ul role="list" className="-mx-2 space-y-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={classNames(
                        isActive
                          ? "bg-slate-800 text-white shadow-sm shadow-slate-950/50"
                          : "text-slate-400 hover:bg-slate-800 hover:text-white transition-colors duration-200",
                        "group flex gap-x-3 rounded-lg p-2 text-sm leading-6 font-semibold"
                      )}
                    >
                      <item.icon className="h-6 w-6 shrink-0" />
                      {item.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
          <li className="mt-auto">
            <div className="flex items-center gap-x-4 py-3 text-sm font-semibold leading-6 text-white bg-slate-800/50 rounded-lg px-4 border border-slate-700/50 backdrop-blur-sm">
              <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center text-xs ring-2 ring-slate-800 text-slate-300">
                {username ? username.charAt(0).toUpperCase() : "A"}
              </div>
              <span className="sr-only">Your profile</span>
              <span aria-hidden="true" className="truncate max-w-[80px]">{username}</span>
              <Link href="/admin/login" className="ml-auto text-slate-400 hover:text-white transition-colors p-1 rounded-full hover:bg-slate-700" title="退出登录">
                 <LogoutIcon className="h-5 w-5" />
              </Link>
            </div>
          </li>
        </ul>
      </nav>
    </div>
  );
}