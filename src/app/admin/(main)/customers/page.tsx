"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Customer = {
  id: string;
  name: string;
  phone: string;
  idType: string;
  idNumber: string;
  email: string | null;
  riskLevel: string;
  source: string | null;
  createdAt: string;
};

const RISK_MAP: Record<string, { label: string; cls: string }> = {
  LOW: { label: "低风险", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  NORMAL: { label: "正常", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  HIGH: { label: "高风险", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  BLACKLIST: { label: "黑名单", cls: "bg-red-50 text-red-700 border-red-200" },
};

export default function CustomersPage() {
  const [items, setItems] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (keyword) params.set("keyword", keyword);
      const res = await fetch(`/api/customers?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "加载失败");
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [page, keyword]); // eslint-disable-line react-hooks/exhaustive-deps

  function doSearch() { setPage(1); setKeyword(searchInput.trim()); }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <header className="panel-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">客户管理</h1>
          <p className="mt-1 text-sm text-slate-600">查看与管理所有客户信息</p>
        </div>
        <div className="flex gap-2">
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-48"
            placeholder="姓名/手机号/证件号"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
          />
          <button onClick={doSearch} className="btn-soft rounded-lg px-3 py-2 text-sm">搜索</button>
          <Link href="/admin/register" className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800">新增客户</Link>
        </div>
      </header>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <section className="table-shell overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-3">姓名</th>
                <th className="px-4 py-3">手机号</th>
                <th className="px-4 py-3">证件号</th>
                <th className="px-4 py-3">邮箱</th>
                <th className="px-4 py-3">风险等级</th>
                <th className="px-4 py-3">注册时间</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">加载中...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">暂无客户</td></tr>
              ) : items.map((c) => {
                const risk = RISK_MAP[c.riskLevel] ?? RISK_MAP.NORMAL;
                return (
                  <tr key={c.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                    <td className="px-4 py-3 text-slate-700">{c.phone}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{c.idNumber}</td>
                    <td className="px-4 py-3 text-slate-500">{c.email ?? "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${risk.cls}`}>{risk.label}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/customers/${c.id}`} className="text-blue-600 hover:underline text-sm">详情</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
            <span className="text-slate-500">共 {total} 条</span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-2 py-1 disabled:opacity-30">上一页</button>
              <span className="px-2 py-1 text-slate-600">{page}/{totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="rounded border px-2 py-1 disabled:opacity-30">下一页</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
