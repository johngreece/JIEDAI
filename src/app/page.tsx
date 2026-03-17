import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="text-center max-w-md mb-10">
        <h1 className="text-2xl font-bold mb-2">借款业务管理系统</h1>
        <p className="text-slate-600 mb-2">Loan Management System</p>
        <p className="text-sm text-slate-500">
          资金可追溯 · 合同可签署 · 还款可确认 · 全流程可审计
        </p>
      </div>

      <div className="flex gap-6 flex-wrap justify-center">
        {/* 管理端入口 */}
        <Link
          href="/admin/login"
          className="w-52 rounded-lg border border-slate-200 bg-white p-6 shadow-sm text-center hover:shadow-md transition-shadow"
        >
          <div className="text-3xl mb-3">🏢</div>
          <h2 className="font-semibold text-lg mb-1">管理端</h2>
          <p className="text-sm text-slate-500">内部管理人员登录</p>
        </Link>

        {/* 客户端入口 */}
        <Link
          href="/client/login"
          className="w-52 rounded-lg border border-slate-200 bg-white p-6 shadow-sm text-center hover:shadow-md transition-shadow"
        >
          <div className="text-3xl mb-3">👤</div>
          <h2 className="font-semibold text-lg mb-1">客户端</h2>
          <p className="text-sm text-slate-500">借款客户登录</p>
        </Link>
      </div>
    </main>
  );
}
