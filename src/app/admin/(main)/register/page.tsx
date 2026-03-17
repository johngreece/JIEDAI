"use client";

import { useState } from "react";
import Link from "next/link";

export default function AdminRegisterPage() {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    idNumber: "",
    address: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ id: string } | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    fetch("/api/customers/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        email: form.email || undefined,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setSuccess({ id: data.id });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  if (success) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="panel-soft max-w-sm w-full rounded-lg p-6 text-center">
          <p className="text-green-600 font-medium mb-2">登记成功</p>
          <p className="text-sm text-slate-600 mb-4">客户 ID：{success.id}</p>
          <Link href="/admin/dashboard" className="text-blue-600 text-sm hover:underline">返回工作台</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <header className="panel-soft mb-6 rounded-2xl px-5 py-4">
        <h1 className="text-xl font-semibold">客户登记</h1>
        <p className="text-sm text-slate-500 mt-1">录入新客户基本信息</p>
      </header>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">{error}</div>}
      <form onSubmit={handleSubmit} className="max-w-md space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">姓名 *</label>
          <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input-base" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">手机号 *</label>
          <input required value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="input-base" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">证件号 *</label>
          <input required value={form.idNumber} onChange={(e) => setForm((f) => ({ ...f, idNumber: e.target.value }))} className="input-base" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">邮箱</label>
          <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="input-base" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">地址</label>
          <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="input-base" />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 font-medium disabled:opacity-50">
          {loading ? "提交中…" : "提交登记"}
        </button>
      </form>
    </div>
  );
}
