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
    <main className="min-h-screen flex items-center justify-center p-8 bg-slate-50">
      <div className="w-full max-w-sm">
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
          noValidate
        >
          <h1 className="text-xl font-semibold mb-1">客户登录</h1>
          <p className="text-sm text-slate-500 mb-6">查看我的借款 · 签署合同 · 确认还款</p>
          {error && (
            <div className="mb-4 text-sm text-red-600 rounded bg-red-50 border border-red-200 px-3 py-2" role="alert">
              {error}
            </div>
          )}
          <div className="mb-4">
            <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1">手机号</label>
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input-base"
              required
              disabled={submitting}
            />
          </div>
          <div className="mb-6">
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">密码</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-base"
              required
              disabled={submitting}
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 focus:outline focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            disabled={submitting}
          >
            {submitting ? "登录中…" : "登录"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          <Link href="/" className="text-blue-600 hover:underline">返回首页</Link>
        </p>
      </div>
    </main>
  );
}
