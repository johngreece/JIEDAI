"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const TEST_ACCOUNTS = [
  { label: "超级管理员", username: "admin", password: "Wanjin888@" },
  { label: "审批经理", username: "manager", password: "manager123" },
  { label: "财务", username: "finance", password: "finance123" },
  { label: "操作员", username: "operator", password: "operator123" },
];

export default function AdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function loginWithCredentials(nextUsername: string, nextPassword: string) {
    setUsername(nextUsername);
    setPassword(nextPassword);
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: nextUsername, password: nextPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "登录失败，请检查用户名与密码");
        return;
      }
      router.push("/admin/dashboard");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await loginWithCredentials(username, password);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/4 h-80 w-80 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-indigo-400/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_25%,rgba(255,255,255,0.12),transparent_40%),radial-gradient(circle_at_85%_80%,rgba(56,189,248,0.18),transparent_45%)]" />
      </div>

      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 px-4 py-10 lg:grid-cols-5 lg:gap-8 lg:px-8">
        <section className="fade-in-up hidden rounded-3xl border border-white/10 bg-white/5 p-10 shadow-2xl backdrop-blur-sm lg:col-span-3 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/30 bg-cyan-300/15 px-3 py-1 text-xs font-medium text-cyan-100">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              JIEDAI ADMIN
            </div>

            <h2 className="mt-8 max-w-xl text-4xl font-semibold leading-tight text-white">
              高效管理借贷业务，
              <br />
              让审计、风控与运营清晰可控
            </h2>

            <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-200/85">
              统一处理申请审核、放款追踪、还款确认与对账记录，提升资金流程可视化与团队协作效率。
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-slate-300">审核效率</p>
              <p className="mt-2 text-xl font-semibold text-cyan-100">+42%</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-slate-300">风险预警</p>
              <p className="mt-2 text-xl font-semibold text-cyan-100">实时</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-slate-300">资金链路</p>
              <p className="mt-2 text-xl font-semibold text-cyan-100">全追踪</p>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center lg:col-span-2">
          <div className="glass-login-card fade-in-up-delay w-full max-w-md rounded-3xl p-7 md:p-8">
            <div className="mb-7 text-center lg:text-left">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-300/20">
                <svg className="h-4 w-4 text-cyan-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">管理端登录</h1>
              <p className="mt-2 text-sm text-slate-200/85">请输入管理员账号与密码继续</p>
            </div>

            <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-white">测试账号快捷入口</h2>
                  <p className="mt-1 text-xs text-slate-300/75">内部联调时可直接一键登录常用后台角色。</p>
                </div>
                <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 text-[11px] text-cyan-100">
                  Test Mode
                </span>
              </div>

              <div className="mt-4 grid gap-2.5">
                {TEST_ACCOUNTS.map((account) => (
                  <button
                    key={account.username}
                    type="button"
                    disabled={submitting}
                    onClick={() => void loginWithCredentials(account.username, account.password)}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/40 px-3 py-3 text-left transition hover:border-cyan-300/40 hover:bg-slate-900/70 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span>
                      <span className="block text-sm font-medium text-white">{account.label}</span>
                      <span className="block text-xs text-slate-300/70">{account.username}</span>
                    </span>
                    <span className="text-xs font-medium text-cyan-100">一键登录</span>
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded-xl border border-rose-300/35 bg-rose-500/20 px-3 py-2.5 text-sm text-rose-100">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="username" className="mb-1.5 block text-sm text-slate-100/90">
                  用户名
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-300/80">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    required
                    className="glass-input block w-full rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-300/70 outline-none"
                    placeholder="请输入用户名"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm text-slate-100/90">
                  密码
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-300/80">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="glass-input block w-full rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-300/70 outline-none"
                    placeholder="请输入密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="glass-button flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    登录中...
                  </span>
                ) : (
                  "登录系统"
                )}
              </button>
            </form>

            <div className="mt-6 border-t border-white/15 pt-4 text-center">
              <Link href="/" className="text-sm text-cyan-100 transition hover:text-cyan-200">
                返回首页
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
