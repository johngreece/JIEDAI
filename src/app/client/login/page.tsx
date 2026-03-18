"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ClientLoginPage() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/client/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "登录失败");
        return;
      }
      router.push("/client/dashboard");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-950 px-4 py-10 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-cyan-400/25 blur-3xl" />
        <div className="absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.10),transparent_35%),radial-gradient(circle_at_80%_70%,rgba(125,211,252,0.15),transparent_40%)]" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="glass-login-card fade-in-up w-full rounded-3xl p-7 md:p-8">
          <div className="mb-7 text-center fade-in-up-delay">
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-300/20">
              <svg className="h-4 w-4 text-cyan-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">欢迎登录</h1>
            <p className="mt-2 text-sm text-slate-200/80">进入借款账户，查看合同与还款进度</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-300/35 bg-rose-500/20 px-3 py-2.5 text-sm text-rose-100">
                <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm text-slate-100/90">手机号码</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-300/80">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="glass-input block w-full rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-300/70 outline-none"
                  placeholder="请输入11位手机号"
                  disabled={submitting}
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-slate-100/90">登录密码</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-300/80">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="glass-input block w-full rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-300/70 outline-none"
                  placeholder="请输入登录密码"
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
              ) : "立即登录"}
            </button>
          </form>

          <div className="mt-6 border-t border-white/15 pt-4 text-center">
            <Link href="/" className="text-sm text-cyan-100 transition hover:text-cyan-200">
              返回首页
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-300/75">&copy; {new Date().getFullYear()} Jiedai System</p>
      </div>
    </div>
  );
}
