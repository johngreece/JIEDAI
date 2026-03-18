"use client";

import { useEffect, useState, useCallback } from "react";

type Role = { id: string; name: string; code: string };
type User = {
  id: string;
  username: string;
  realName: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  role: Role | null;
};

export default function UsersPage() {
  const [items, setItems] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", realName: "", phone: "", email: "", roleId: "" });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/users?${params}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch { /* */ } finally { setLoading(false); }
  }, [page, search]);

  const loadRoles = useCallback(async () => {
    try {
      const res = await fetch("/api/roles");
      const data = await res.json();
      setRoles(data.items ?? []);
    } catch { /* */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadRoles(); }, [loadRoles]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? "创建失败"); return; }
      setShowForm(false);
      setForm({ username: "", password: "", realName: "", phone: "", email: "", roleId: "" });
      load();
    } catch { alert("创建失败"); } finally { setSubmitting(false); }
  }

  async function toggleActive(id: string, isActive: boolean) {
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error ?? "操作失败"); return; }
      load();
    } catch { alert("操作失败"); }
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <header className="panel-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">用户管理</h1>
          <p className="mt-1 text-sm text-slate-600">管理系统操作员和账号</p>
        </div>
        <div className="flex gap-2">
          <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="搜索用户名/姓名" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <button onClick={() => setShowForm(!showForm)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800">
            {showForm ? "取消" : "新增用户"}
          </button>
        </div>
      </header>

      {showForm && (
        <form onSubmit={handleCreate} className="panel-soft rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">新增用户</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <input required className="rounded-lg border px-3 py-2 text-sm" placeholder="用户名" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <input required type="password" className="rounded-lg border px-3 py-2 text-sm" placeholder="密码" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <input required className="rounded-lg border px-3 py-2 text-sm" placeholder="姓名" value={form.realName} onChange={(e) => setForm({ ...form, realName: e.target.value })} />
            <input className="rounded-lg border px-3 py-2 text-sm" placeholder="手机号" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className="rounded-lg border px-3 py-2 text-sm" placeholder="邮箱" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <select required className="rounded-lg border px-3 py-2 text-sm" value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
              <option value="">选择角色</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <button type="submit" disabled={submitting} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50">
            {submitting ? "创建中..." : "创建"}
          </button>
        </form>
      )}

      <section className="table-shell overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-3">用户名</th>
                <th className="px-4 py-3">姓名</th>
                <th className="px-4 py-3">角色</th>
                <th className="px-4 py-3">手机</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">最后登录</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">加载中...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">暂无用户</td></tr>
              ) : items.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-slate-900">{u.username}</td>
                  <td className="px-4 py-3 text-slate-700">{u.realName}</td>
                  <td className="px-4 py-3"><span className="inline-flex rounded-full border bg-blue-50 border-blue-200 px-2 py-0.5 text-xs text-blue-700">{u.role?.name ?? "-"}</span></td>
                  <td className="px-4 py-3 text-slate-500">{u.phone ?? "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${u.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                      {u.isActive ? "启用" : "禁用"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "-"}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(u.id, u.isActive)} className={`text-sm hover:underline ${u.isActive ? "text-red-600" : "text-emerald-600"}`}>
                      {u.isActive ? "禁用" : "启用"}
                    </button>
                  </td>
                </tr>
              ))}
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
