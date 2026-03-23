"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { normalizePhoneInput } from "@/lib/phone";

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
        body: JSON.stringify({
          phone: normalizePhoneInput(phone),
          password,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "登录失败，请检查手机号和密码");
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
        <div className="glass-login-card w-full rounded-3xl p-7 md:p-8">
          <div className="mb-7 text-center">
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-300/20">
              <svg className="h-4 w-4 text-cyan-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">客户登录</h1>
            <p className="mt-2 text-sm text-slate-200/80">进入借款账户，查看合同、借款和还款进度</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error ? (
              <div className="rounded-xl border border-rose-300/35 bg-rose-500/20 px-3 py-2.5 text-sm text-rose-100">
                {error}
              </div>
            ) : null}

            <div>
              <label className="mb-1.5 block text-sm text-slate-100/90">手机号</label>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                disabled={submitting}
                className="glass-input block w-full rounded-xl py-2.5 px-3 text-sm text-white placeholder:text-slate-300/70 outline-none"
                placeholder="请输入手机号"
              />
              <p className="mt-1.5 text-xs text-slate-300/70">支持纯数字、空格、横杠或国际区号格式。</p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-slate-100/90">登录密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={submitting}
                className="glass-input block w-full rounded-xl py-2.5 px-3 text-sm text-white placeholder:text-slate-300/70 outline-none"
                placeholder="请输入登录密码"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="glass-button flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "登录中..." : "立即登录"}
            </button>
          </form>

          <div className="mt-6 border-t border-white/15 pt-4 text-center">
            <Link href="/" className="text-sm text-cyan-100 transition hover:text-cyan-200">
              返回首页
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
