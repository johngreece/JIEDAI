"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "登录失败，请检查账号和密码");
        return;
      }

      router.push("/admin/dashboard");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/4 h-80 w-80 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-indigo-400/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_25%,rgba(255,255,255,0.12),transparent_40%),radial-gradient(circle_at_85%_80%,rgba(56,189,248,0.18),transparent_45%)]" />
      </div>

      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 px-4 py-10 lg:grid-cols-5 lg:gap-8 lg:px-8">
        <section className="hidden rounded-3xl border border-white/10 bg-white/5 p-10 shadow-2xl backdrop-blur-sm lg:col-span-3 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/30 bg-cyan-300/15 px-3 py-1 text-xs font-medium text-cyan-100">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              JIEDAI ADMIN
            </div>

            <h2 className="mt-8 max-w-xl text-4xl font-semibold leading-tight text-white">
              统一管理借贷业务，
              <br />
              让审批、风控与运营清晰可控
            </h2>

            <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-200/85">
              统一处理申请审核、放款追踪、还款确认、资金方管理和审计记录，支撑正式业务上线后的稳定运营。
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-slate-300">审批流程</p>
              <p className="mt-2 text-xl font-semibold text-cyan-100">在线协同</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-slate-300">风控预警</p>
              <p className="mt-2 text-xl font-semibold text-cyan-100">实时追踪</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-slate-300">资金链路</p>
              <p className="mt-2 text-xl font-semibold text-cyan-100">全程留痕</p>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center lg:col-span-2">
          <div className="glass-login-card w-full max-w-md rounded-3xl p-7 md:p-8">
            <div className="mb-7 text-center lg:text-left">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-300/20">
                <svg className="h-4 w-4 text-cyan-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">管理端登录</h1>
              <p className="mt-2 text-sm text-slate-200/85">请输入管理员账号和密码继续</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error ? (
                <div className="rounded-xl border border-rose-300/35 bg-rose-500/20 px-3 py-2.5 text-sm text-rose-100">
                  {error}
                </div>
              ) : null}

              <div>
                <label htmlFor="username" className="mb-1.5 block text-sm text-slate-100/90">
                  用户名
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={submitting}
                  className="glass-input block w-full rounded-xl py-2.5 px-3 text-sm text-white placeholder:text-slate-300/70 outline-none"
                  placeholder="请输入用户名"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm text-slate-100/90">
                  密码
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  className="glass-input block w-full rounded-xl py-2.5 px-3 text-sm text-white placeholder:text-slate-300/70 outline-none"
                  placeholder="请输入密码"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="glass-button flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "登录中..." : "登录系统"}
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
