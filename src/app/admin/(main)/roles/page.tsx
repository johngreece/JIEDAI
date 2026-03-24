"use client";

import { useCallback, useEffect, useState } from "react";

type Permission = { id: string; code: string; name: string; module: string };
type Role = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: Permission[];
};

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPerms, setAllPerms] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", description: "", permissionIds: [] as string[] });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/roles");
      const data = await res.json();
      setRoles(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPerms = useCallback(async () => {
    try {
      const res = await fetch("/api/permissions");
      const data = await res.json();
      setAllPerms(data.items ?? []);
    } catch {
      setAllPerms([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadPerms();
  }, [loadPerms]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/roles", {
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
      setForm({ name: "", code: "", description: "", permissionIds: [] });
      await load();
    } catch {
      alert("创建失败");
    } finally {
      setSubmitting(false);
    }
  }

  function togglePerm(permId: string) {
    setForm((prev) => ({
      ...prev,
      permissionIds: prev.permissionIds.includes(permId)
        ? prev.permissionIds.filter((id) => id !== permId)
        : [...prev.permissionIds, permId],
    }));
  }

  const modules = allPerms.reduce<Record<string, Permission[]>>((acc, permission) => {
    (acc[permission.module] ??= []).push(permission);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <header className="panel-soft admin-page-header">
        <div className="admin-page-header__meta">
          <span className="admin-page-header__eyebrow">Roles & Permissions</span>
          <h1 className="admin-page-header__title">角色管理</h1>
          <p className="admin-page-header__description">统一管理后台角色、权限模块与用户占用情况，让权限体系更清晰可维护。</p>
        </div>
        <div className="admin-toolbar-group">
          <button onClick={() => setShowForm((current) => !current)} className="admin-btn admin-btn-primary">
            {showForm ? "取消新增" : "新增角色"}
          </button>
        </div>
      </header>

      {showForm ? (
        <form onSubmit={handleCreate} className="admin-form-shell">
          <div className="admin-section-card__header -mx-5 -mt-5 mb-5 border-b border-slate-100 px-5">
            <div>
              <div className="admin-section-card__title">创建角色</div>
              <p className="admin-section-card__description">填写角色基础信息，并从权限模块中勾选该角色允许访问的能力。</p>
            </div>
          </div>

          <div className="admin-form-grid md:grid-cols-3">
            <input required className="admin-field text-sm" placeholder="角色名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input required className="admin-field text-sm" placeholder="角色编码，如 operator" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <input className="admin-field text-sm" placeholder="描述" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          {Object.keys(modules).length > 0 ? (
            <div className="mt-5 space-y-3">
              <div className="admin-section-card__title text-sm">权限分配</div>
              {Object.entries(modules).map(([moduleName, permissions]) => (
                <div key={moduleName} className="admin-note-block">
                  <div className="mb-3 text-sm font-semibold text-slate-800">{moduleName}</div>
                  <div className="flex flex-wrap gap-2">
                    {permissions.map((permission) => {
                      const active = form.permissionIds.includes(permission.id);
                      return (
                        <label
                          key={permission.id}
                          className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                            active
                              ? "border-blue-300 bg-blue-100 text-blue-800"
                              : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                          }`}
                        >
                          <input type="checkbox" className="sr-only" checked={active} onChange={() => togglePerm(permission.id)} />
                          {permission.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-5">
            <button type="submit" disabled={submitting} className="admin-btn admin-btn-primary">
              {submitting ? "创建中..." : "创建角色"}
            </button>
          </div>
        </form>
      ) : null}

      <section className="space-y-4">
        {loading ? (
          <div className="py-8 text-center text-slate-400">加载中...</div>
        ) : roles.length === 0 ? (
          <div className="py-8 text-center text-slate-400">暂无角色</div>
        ) : (
          roles.map((role) => (
            <div key={role.id} className="admin-section-card">
              <div className="admin-section-card__header">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="admin-section-card__title">{role.name}</div>
                  <span className="font-mono text-xs text-slate-400">{role.code}</span>
                  {role.isSystem ? (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-700">系统角色</span>
                  ) : null}
                </div>
                <span className="text-xs text-slate-400">{role.userCount} 个用户</span>
              </div>
              <div className="admin-section-card__body space-y-3">
                {role.description ? <p className="text-sm text-slate-500">{role.description}</p> : null}
                <div className="flex flex-wrap gap-2">
                  {role.permissions.length === 0 ? (
                    <span className="text-xs text-slate-400">暂无权限</span>
                  ) : (
                    role.permissions.map((permission) => (
                      <span key={permission.id} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
                        {permission.name}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
