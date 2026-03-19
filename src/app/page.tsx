import Link from "next/link";
import { CompanyLogo } from "@/components/CompanyLogo";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-[30rem] w-[30rem] rounded-full bg-indigo-400/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(255,255,255,0.14),transparent_38%),radial-gradient(circle_at_80%_75%,rgba(56,189,248,0.18),transparent_45%)]" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-8 md:px-8 md:py-10">
        <header className="glass-login-card fade-in-up flex items-center justify-between rounded-2xl px-5 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <CompanyLogo size={36} />
            <div>
              <p className="text-sm font-semibold tracking-wide text-white">财大气粗总公司</p>
              <p className="text-xs text-slate-300/80">全流程借贷业务平台</p>
            </div>
          </div>
          <span className="hidden rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-slate-200 md:inline-flex">
            专业 · 安全 · 高效
          </span>
        </header>

        <section className="fade-in-up-delay mx-auto mt-10 w-full max-w-4xl text-center md:mt-14">
          <h1 className="text-4xl font-semibold leading-tight text-white md:text-5xl">
            全流程借贷业务管理门户
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-200/85 md:text-lg">
            连接申请、审批、合同、放款与还款确认，构建统一且透明的资金管理闭环。
          </p>
        </section>

        <section className="mx-auto mt-10 grid w-full max-w-5xl grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
          <Link
            href="/admin/login"
            className="glass-login-card group rounded-3xl p-7 transition duration-300 hover:-translate-y-1"
          >
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-cyan-100">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-white">管理端入口</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-200/80">
              面向风控、财务与运营团队，处理审核审批、放款跟踪、还款管理与审计报表。
            </p>
            <span className="mt-6 inline-flex items-center text-sm font-semibold text-cyan-100">
              进入管理台
              <span className="ml-1 transition-transform group-hover:translate-x-1">→</span>
            </span>
          </Link>

          <Link
            href="/client/login"
            className="glass-login-card group rounded-3xl p-7 transition duration-300 hover:-translate-y-1"
          >
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-cyan-100">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-white">客户端入口</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-200/80">
              面向借款客户，查看申请进度、在线签署合同、确认放款到账与还款记录。
            </p>
            <span className="mt-6 inline-flex items-center text-sm font-semibold text-cyan-100">
              立即登录
              <span className="ml-1 transition-transform group-hover:translate-x-1">→</span>
            </span>
          </Link>

          <Link
            href="/funder/login"
            className="glass-login-card group rounded-3xl p-7 transition duration-300 hover:-translate-y-1"
          >
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-200/30 bg-emerald-300/20 text-emerald-100">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-white">资金方入口</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-200/80">
              面向资金合作伙伴，查看投资收益、放款明细、提现管理与合作协议。
            </p>
            <span className="mt-6 inline-flex items-center text-sm font-semibold text-emerald-100">
              资金方登录
              <span className="ml-1 transition-transform group-hover:translate-x-1">→</span>
            </span>
          </Link>
        </section>

        <footer className="mt-auto pt-10 text-center text-xs text-slate-300/70">
          © {new Date().getFullYear()} 财大气粗总公司. All rights reserved.
        </footer>
      </div>
    </main>
  );
}
