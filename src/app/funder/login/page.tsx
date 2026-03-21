"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { normalizePhoneInput } from "@/lib/phone";

const TEST_ACCOUNTS = [
  { label: "自有资金", phone: "13900000001", password: "funder123" },
  { label: "稳利月息", phone: "13900000010", password: "funder123" },
  { label: "灵活项目", phone: "6973000003", password: "funder123" },
];

export default function FunderLoginPage() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function loginWithCredentials(nextPhone: string, nextPassword: string) {
    setPhone(nextPhone);
    setPassword(nextPassword);
    setError("");
    setSubmitting(true);
    try {
      const normalizedPhone = normalizePhoneInput(nextPhone);
      const res = await fetch("/api/auth/funder/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizedPhone, password: nextPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "登录失败");
        return;
      }
      router.push("/funder/dashboard");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await loginWithCredentials(phone, password);
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-950 px-4 py-10 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-emerald-400/25 blur-3xl" />
        <div className="absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-teal-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.10),transparent_35%),radial-gradient(circle_at_80%_70%,rgba(52,211,153,0.15),transparent_40%)]" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="glass-login-card fade-in-up w-full rounded-3xl p-7 md:p-8">
          <div className="mb-7 text-center fade-in-up-delay">
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-300/20">
              <svg className="h-4 w-4 text-emerald-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">资金方登录</h1>
            <p className="mt-2 text-sm text-slate-200/80">查看投资收益与资金流向</p>
          </div>

          <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">测试账号快捷入口</h2>
                <p className="mt-1 text-xs text-slate-300/75">内部联调时可直接一键登录常用资金方账号。</p>
              </div>
              <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-1 text-[11px] text-emerald-100">
                Test Mode
              </span>
            </div>

            <div className="mt-4 grid gap-2.5">
              {TEST_ACCOUNTS.map((account) => (
                <button
                  key={account.phone}
                  type="button"
                  disabled={submitting}
                  onClick={() => void loginWithCredentials(account.phone, account.password)}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/40 px-3 py-3 text-left transition hover:border-emerald-300/40 hover:bg-slate-900/70 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>
                    <span className="block text-sm font-medium text-white">{account.label}</span>
                    <span className="block text-xs text-slate-300/70">{account.phone}</span>
                  </span>
                  <span className="text-xs font-medium text-emerald-100">一键登录</span>
                </button>
              ))}
            </div>
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
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="glass-input block w-full rounded-xl py-2.5 px-3 text-sm text-white placeholder:text-slate-300/70 outline-none"
                placeholder="请输入手机号"
                disabled={submitting}
              />
              <p className="mt-1.5 text-xs text-slate-300/70">支持纯数字、带空格、横杠或国际区号手机号。</p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-slate-100/90">登录密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="glass-input block w-full rounded-xl py-2.5 px-3 text-sm text-white placeholder:text-slate-300/70 outline-none"
                placeholder="请输入登录密码"
                disabled={submitting}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="glass-button w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-50"
            >
              {submitting ? "登录中..." : "登 录"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
