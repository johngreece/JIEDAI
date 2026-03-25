"use client";

import { useCallback, useEffect, useState } from "react";

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

export function UsersPageClient() {
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
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  const loadRoles = useCallback(async () => {
    try {
      const res = await fetch("/api/roles");
      const data = await res.json();
      setRoles(data.items ?? []);
    } catch {
      setRoles([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "创建失败");
        return;
      }
      setShowForm(false);
      setForm({ username: "", password: "", realName: "", phone: "", email: "", roleId: "" });
      await load();
    } catch {
      alert("创建失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "操作失败");
        return;
      }
      await load();
    } catch {
      alert("操作失败");
    }
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <header className="panel-soft admin-page-header">
        <div className="admin-page-header__meta">
          <span className="admin-page-header__eyebrow">Admin Users</span>
          <h1 className="admin-page-header__title">用户管理</h1>
          <p className="admin-page-header__description">管理后台操作账号、角色归属、启用状态与最近登录信息。</p>
        </div>
        <div className="admin-toolbar-group">
          <input
            className="admin-field w-52 text-sm"
            placeholder="搜索用户名或姓名"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <button onClick={() => setShowForm((current) => !current)} className="admin-btn admin-btn-primary">
            {showForm ? "取消新增" : "新增用户"}
          </button>
        </div>
      </header>

      {showForm ? (
        <form onSubmit={handleCreate} className="panel-soft rounded-[1.6rem] p-5">
          <div className="admin-table-toolbar -mx-5 -mt-5 mb-5 border-b border-slate-100 px-5">
            <div>
              <div className="admin-table-title">创建后台用户</div>
              <p className="admin-table-note">统一使用圆角输入框与主按钮风格，保证子页面体验一致。</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <input
              required
              className="admin-field text-sm"
              placeholder="用户名"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
            <input
              required
              type="password"
              className="admin-field text-sm"
              placeholder="密码"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <input
              required
              className="admin-field text-sm"
              placeholder="姓名"
              value={form.realName}
              onChange={(e) => setForm({ ...form, realName: e.target.value })}
            />
            <input
              className="admin-field text-sm"
              placeholder="手机号"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <input
              className="admin-field text-sm"
              placeholder="邮箱"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <select
              required
              className="admin-field text-sm"
              value={form.roleId}
              onChange={(e) => setForm({ ...form, roleId: e.target.value })}
            >
              <option value="">选择角色</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-5">
            <button type="submit" disabled={submitting} className="admin-btn admin-btn-primary">
              {submitting ? "创建中..." : "创建用户"}
            </button>
          </div>
        </form>
      ) : null}

      <section className="table-shell admin-table-shell">
        <div className="admin-table-toolbar">
          <div>
            <div className="admin-table-title">账号列表</div>
            <p className="admin-table-note">支持按角色和启用状态进行日常权限巡检。</p>
          </div>
          <div className="text-xs font-medium text-slate-500">每页 20 条</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3">用户名</th>
                <th className="px-4 py-3">姓名</th>
                <th className="px-4 py-3">角色</th>
                <th className="px-4 py-3">手机</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">最近登录</th>
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
                    暂无用户
                  </td>
                </tr>
              ) : (
                items.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{user.username}</td>
                    <td className="px-4 py-3 text-slate-700">{user.realName}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                        {user.role?.name ?? "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{user.phone ?? "-"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                          user.isActive
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-red-200 bg-red-50 text-red-700"
                        }`}
                      >
                        {user.isActive ? "启用" : "禁用"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "-"}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(user.id, user.isActive)}
                        className={`text-sm font-medium hover:underline ${
                          user.isActive ? "text-red-600" : "text-emerald-600"
                        }`}
                      >
                        {user.isActive ? "禁用" : "启用"}
                      </button>
                    </td>
                  </tr>
                ))
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
                onClick={() => setPage(page - 1)}
                className="admin-btn admin-btn-ghost admin-btn-sm"
              >
                上一页
              </button>
              <span className="admin-pagination__status">
                {page}/{totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
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
