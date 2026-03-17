import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold mb-2">借款业务管理系统</h1>
        <p className="text-slate-600 mb-2">
          Loan Management System
        </p>
        <p className="text-sm text-slate-500 mb-8">
          资金可追溯 · 合同可签署 · 还款可确认 · 全流程可审计
        </p>
      </div>
      <nav className="flex gap-4" aria-label="主导航">
        <Link
          href="/dashboard"
          className="rounded-lg bg-slate-800 text-white px-5 py-2.5 hover:bg-slate-700 transition-colors"
        >
          工作台
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 hover:bg-slate-100 transition-colors"
        >
          登录
        </Link>
      </nav>
    </main>
  );
}
