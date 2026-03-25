"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { CustomerListItem } from "@/lib/admin-prefetch";

const RISK_MAP: Record<string, { label: string; cls: string }> = {
  LOW: { label: "低风险", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  NORMAL: { label: "正常", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  HIGH: { label: "高风险", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  BLACKLIST: { label: "黑名单", cls: "bg-red-50 text-red-700 border-red-200" },
};

type CustomersPageClientProps = {
  initialItems: CustomerListItem[];
  initialTotal: number;
  initialPage?: number;
  initialKeyword?: string;
};

export function CustomersPageClient({
  initialItems,
  initialTotal,
  initialPage = 1,
  initialKeyword = "",
}: CustomersPageClientProps) {
  const [items, setItems] = useState<CustomerListItem[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [keyword, setKeyword] = useState(initialKeyword);
  const [searchInput, setSearchInput] = useState(initialKeyword);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const didMountRef = useRef(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (keyword) params.set("keyword", keyword);
      const res = await fetch(`/api/customers?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "加载失败");
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function removeCustomer(customer: CustomerListItem) {
    if (!window.confirm(`确认删除客户“${customer.name}”吗？`)) return;
    setError("");
    try {
      const response = await fetch(`/api/customers/${customer.id}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "删除失败");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  }

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    void load();
  }, [page, keyword]);

  function doSearch() {
    setPage(1);
    setKeyword(searchInput.trim());
  }

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-6">
      <header className="panel-soft admin-page-header">
        <div className="admin-page-header__meta">
          <span className="admin-page-header__eyebrow">Customer Center</span>
          <h1 className="admin-page-header__title">客户管理</h1>
          <p className="admin-page-header__description">
            统一查看客户档案、联系方式、风控等级与注册时间，首屏直接出数据，减少等待。
          </p>
        </div>
        <div className="admin-toolbar-group">
          <input
            className="admin-field w-52 text-sm"
            placeholder="姓名 / 手机 / 证件号"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
          />
          <button onClick={doSearch} className="admin-btn admin-btn-secondary">
            搜索
          </button>
          <Link href="/admin/register" className="admin-btn admin-btn-primary">
            新增客户
          </Link>
        </div>
      </header>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="table-shell admin-table-shell">
        <div className="admin-table-toolbar">
          <div>
            <div className="admin-table-title">客户列表</div>
            <p className="admin-table-note">支持按关键字快速检索，并直接进入客户详情。</p>
          </div>
          <div className="text-xs font-medium text-slate-500">每页 20 条</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
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
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    加载中...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    暂无客户
                  </td>
                </tr>
              ) : (
                items.map((customer) => {
                  const risk = RISK_MAP[customer.riskLevel] ?? RISK_MAP.NORMAL;
                  return (
                    <tr key={customer.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">{customer.name}</td>
                      <td className="px-4 py-3 text-slate-700">{customer.phone}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{customer.idNumber}</td>
                      <td className="px-4 py-3 text-slate-500">{customer.email ?? "-"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${risk.cls}`}>
                          {risk.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(customer.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="admin-btn-group">
                          <Link href={`/admin/customers/${customer.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                            查看详情
                          </Link>
                          <button
                            type="button"
                            onClick={() => void removeCustomer(customer)}
                            className="text-sm font-medium text-red-600 hover:underline"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 ? (
          <div className="admin-pagination">
            <span className="admin-pagination__summary">共 {total} 条记录</span>
            <div className="admin-pagination__controls">
              <button
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
                className="admin-btn admin-btn-ghost admin-btn-sm"
              >
                上一页
              </button>
              <span className="admin-pagination__status">
                {page}/{totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
                className="admin-btn admin-btn-ghost admin-btn-sm"
              >
                下一页
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
