"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { normalizePhoneInput } from "@/lib/phone";

export default function FunderLoginPage() {
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
      const res = await fetch("/api/auth/funder/login", {
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

      router.push("/funder/dashboard");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-950 px-4 py-10 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-emerald-400/25 blur-3xl" />
        <div className="absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-teal-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.10),transparent_35%),radial-gradient(circle_at_80%_70%,rgba(52,211,153,0.15),transparent_40%)]" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="glass-login-card w-full rounded-3xl p-7 md:p-8">
          <div className="mb-7 text-center">
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-300/20">
              <svg className="h-4 w-4 text-emerald-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">资金方登录</h1>
            <p className="mt-2 text-sm text-slate-200/80">查看收益、账户余额和提现进度</p>
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
              className="glass-button w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-50"
            >
              {submitting ? "登录中..." : "登录"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
