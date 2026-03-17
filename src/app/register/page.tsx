"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    passportNumber: "",
    passportExpiry: "",
    passportCountry: "",
    residenceNumber: "",
    residenceExpiry: "",
    residenceType: "",
    address: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ customerNo: string } | null>(null);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    fetch("/api/customers/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        passportExpiry: form.passportExpiry || undefined,
        residenceExpiry: form.residenceExpiry || undefined,
        email: form.email || undefined,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setSuccess({ customerNo: data.customerNo });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-sm w-full rounded-lg border bg-white p-6 shadow-sm text-center">
          <p className="text-green-600 font-medium mb-2">登记成功</p>
          <p className="text-sm text-slate-600 mb-4">客户编号：{success.customerNo}</p>
          <Link href="/dashboard" className="text-blue-600 text-sm hover:underline">返回工作台</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold mb-1">客户登记</h1>
          <p className="text-sm text-slate-500 mb-6">请填写护照与居留信息，用于生成借贷合同</p>
          {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">姓名 *</label>
              <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input-base" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">手机</label>
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="input-base" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">护照号 *</label>
              <input required value={form.passportNumber} onChange={(e) => setForm((f) => ({ ...f, passportNumber: e.target.value }))} className="input-base" placeholder="Passport Number" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">护照有效期</label>
              <input type="date" value={form.passportExpiry} onChange={(e) => setForm((f) => ({ ...f, passportExpiry: e.target.value }))} className="input-base" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">护照签发国</label>
              <input value={form.passportCountry} onChange={(e) => setForm((f) => ({ ...f, passportCountry: e.target.value }))} className="input-base" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">居留证件号 *</label>
              <input required value={form.residenceNumber} onChange={(e) => setForm((f) => ({ ...f, residenceNumber: e.target.value }))} className="input-base" placeholder="居留证/签证号" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">居留有效期</label>
              <input type="date" value={form.residenceExpiry} onChange={(e) => setForm((f) => ({ ...f, residenceExpiry: e.target.value }))} className="input-base" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">居留类型</label>
              <input value={form.residenceType} onChange={(e) => setForm((f) => ({ ...f, residenceType: e.target.value }))} className="input-base" placeholder="如：工作居留、学生签" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">地址</label>
              <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="input-base" />
            </div>
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-slate-800 text-white py-2.5 font-medium hover:bg-slate-700 disabled:opacity-50">
              {loading ? "提交中…" : "提交登记"}
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">
          <Link href="/" className="text-blue-600 hover:underline">返回首页</Link>
        </p>
      </div>
    </div>
  );
}
