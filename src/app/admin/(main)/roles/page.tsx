"use client";

import { useEffect, useState, useCallback } from "react";

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
    } catch { /* */ } finally { setLoading(false); }
  }, []);

  const loadPerms = useCallback(async () => {
    try {
      const res = await fetch("/api/permissions");
      const data = await res.json();
      setAllPerms(data.items ?? []);
    } catch { /* */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadPerms(); }, [loadPerms]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? "创建失败"); return; }
      setShowForm(false);
      setForm({ name: "", code: "", description: "", permissionIds: [] });
      load();
    } catch { alert("创建失败"); } finally { setSubmitting(false); }
  }

  function togglePerm(permId: string) {
    setForm((prev) => ({
      ...prev,
      permissionIds: prev.permissionIds.includes(permId)
        ? prev.permissionIds.filter((id) => id !== permId)
        : [...prev.permissionIds, permId],
    }));
  }

  // Group permissions by module
  const modules = allPerms.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <header className="panel-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">角色管理</h1>
          <p className="mt-1 text-sm text-slate-600">管理系统角色和权限配置</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800">
          {showForm ? "取消" : "新增角色"}
        </button>
      </header>

      {showForm && (
        <form onSubmit={handleCreate} className="panel-soft rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">新增角色</h3>
          <div className="grid grid-cols-3 gap-4">
            <input required className="rounded-lg border px-3 py-2 text-sm" placeholder="角色名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input required className="rounded-lg border px-3 py-2 text-sm" placeholder="角色编码 (如 operator)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <input className="rounded-lg border px-3 py-2 text-sm" placeholder="描述" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          {Object.keys(modules).length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">选择权限：</p>
              {Object.entries(modules).map(([mod, perms]) => (
                <div key={mod} className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs font-semibold text-slate-500 w-20">{mod}</span>
                  {perms.map((p) => (
                    <label key={p.id} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs cursor-pointer ${form.permissionIds.includes(p.id) ? "bg-blue-100 border-blue-300 text-blue-800" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
                      <input type="checkbox" className="sr-only" checked={form.permissionIds.includes(p.id)} onChange={() => togglePerm(p.id)} />
                      {p.name}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
          <button type="submit" disabled={submitting} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50">
            {submitting ? "创建中..." : "创建"}
          </button>
        </form>
      )}

      <section className="space-y-4">
        {loading ? (
          <div className="text-center py-8 text-slate-400">加载中...</div>
        ) : roles.length === 0 ? (
          <div className="text-center py-8 text-slate-400">暂无角色</div>
        ) : roles.map((role) => (
          <div key={role.id} className="table-shell rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold text-slate-900">{role.name}</h3>
                <span className="font-mono text-xs text-slate-400">{role.code}</span>
                {role.isSystem && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">系统角色</span>}
              </div>
              <span className="text-xs text-slate-400">{role.userCount} 个用户</span>
            </div>
            {role.description && <p className="text-sm text-slate-500">{role.description}</p>}
            <div className="flex flex-wrap gap-1.5">
              {role.permissions.length === 0 ? (
                <span className="text-xs text-slate-400">暂无权限</span>
              ) : role.permissions.map((p) => (
                <span key={p.id} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">{p.name}</span>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
