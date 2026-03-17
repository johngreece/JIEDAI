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
        setError(data.error ?? "登录失败，请检查用户名与密码");
        return;
      }
      router.push("/admin/dashboard");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen w-full lg:grid lg:grid-cols-2 bg-slate-50">
      {/* Left: Branding */}
      <div className="hidden lg:flex flex-col justify-between bg-slate-900 p-12 text-white">
        <div>
          <div className="flex items-center gap-2 font-bold text-2xl tracking-tight">
            <svg
              className="h-8 w-8 text-blue-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            JIEDAI ADMIN
          </div>
          <div className="mt-12 max-w-md">
            <h2 className="text-3xl font-bold leading-tight">
              专业、安全、高效的<br />借款业务管理系统
            </h2>
            <p className="mt-4 text-slate-400 text-lg">
              全流程资金追踪，多维度风控审计，助力金融业务稳健增长。
            </p>
          </div>
        </div>
        <div className="text-sm text-slate-500">
          &copy; {new Date().getFullYear()} Jiedai System. All rights reserved.
        </div>
      </div>

      {/* Right: Login Form */}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center lg:text-left">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              管理端登录
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              请输入您的管理员账号与密码
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            {error && (
              <div className="rounded-md bg-red-50 p-4 text-sm text-red-700 border border-red-200">
                {error}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label htmlFor="username" className="sr-only">
                  用户名
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <svg
                      className="h-5 w-5 text-slate-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                  </div>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    required
                    className="block w-full rounded-md border-0 py-2.5 pl-10 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                    placeholder="用户名"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="password" className="sr-only">
                  密码
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <svg
                      className="h-5 w-5 text-slate-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="block w-full rounded-md border-0 py-2.5 pl-10 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                    placeholder="密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full justify-center rounded-md bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
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
          <div className="mt-10 text-center">
            <Link href="/" className="text-sm font-medium text-blue-600 hover:text-blue-500">
              返回首页
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
