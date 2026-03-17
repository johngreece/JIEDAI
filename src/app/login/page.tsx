"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
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
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "登录失败，请检查用户名与密码");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
          noValidate
        >
          <h1 className="text-xl font-semibold mb-1">登录</h1>
          <p className="text-sm text-slate-500 mb-6">借款业务管理系统</p>
          {error && (
            <div
              className="mb-4 text-sm text-red-600 rounded bg-red-50 border border-red-200 px-3 py-2"
              role="alert"
            >
              {error}
            </div>
          )}
          <div className="mb-4">
            <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1">
              用户名
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-base"
              required
              disabled={submitting}
            />
          </div>
          <div className="mb-6">
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
              密码
            </label>
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
            className="w-full rounded-lg bg-slate-800 text-white py-2.5 font-medium hover:bg-slate-700 focus:outline focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            disabled={submitting}
          >
            {submitting ? "登录中…" : "登录"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          <Link href="/" className="text-blue-600 hover:underline focus:outline focus:ring-2 focus:ring-blue-500 rounded">
            返回首页
          </Link>
        </p>
      </div>
    </main>
  );
}
