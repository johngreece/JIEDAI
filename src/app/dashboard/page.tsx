import { getSession } from "@/lib/auth";
import { DashboardSummary } from "@/components/dashboard/DashboardSummary";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await getSession();

  return (
    <div className="min-h-screen p-6">
      <header className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-slate-500 hover:text-slate-700 text-sm transition-colors"
          >
            首页
          </Link>
          <h1 className="text-xl font-semibold">工作台</h1>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/register" className="text-sm text-slate-600 hover:underline">客户登记</Link>
          {session?.roles?.includes("super_admin") && (
            <Link href="/settings/loan-fee" className="text-sm text-slate-600 hover:underline">费率配置</Link>
          )}
          {session ? (
            <span className="text-sm text-slate-600" aria-label="当前用户">
              {session.username}
            </span>
          ) : (
            <Link
              href="/login"
              className="text-sm text-blue-600 hover:underline focus:outline focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded px-2 py-1"
            >
              登录
            </Link>
          )}
        </div>
      </header>
      <section aria-label="数据概览">
        <DashboardSummary />
      </section>
    </div>
  );
}
