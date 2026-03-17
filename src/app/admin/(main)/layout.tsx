import Link from "next/link";
import { getAdminSession } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();

  return (
    <div className="min-h-screen flex">
      {/* 侧边栏 */}
      <aside className="w-56 bg-slate-800 text-white flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-700">
          <h2 className="font-semibold text-lg">管理后台</h2>
          <p className="text-xs text-slate-400 mt-1">借款业务管理系统</p>
        </div>
        <nav className="flex-1 p-3 space-y-1" aria-label="管理端导航">
          <Link href="/admin/dashboard" className="admin-nav-link">工作台</Link>
          <Link href="/admin/register" className="admin-nav-link">客户登记</Link>
          {session?.roles?.includes("super_admin") && (
            <Link href="/admin/settings/loan-fee" className="admin-nav-link">费率配置</Link>
          )}
        </nav>
        <div className="p-3 border-t border-slate-700">
          {session ? (
            <span className="text-sm text-slate-300">{session.username}</span>
          ) : (
            <Link href="/admin/login" className="text-sm text-blue-300 hover:underline">登录</Link>
          )}
        </div>
      </aside>
      {/* 主内容 */}
      <main className="flex-1 bg-slate-50 overflow-auto">{children}</main>
    </div>
  );
}
