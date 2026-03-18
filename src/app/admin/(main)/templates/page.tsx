"use client";

import { useEffect, useState } from "react";

type Template = {
  id: string;
  name: string;
  code: string;
  variables: string[];
  version: number;
  isActive: boolean;
  createdAt: string;
};

export default function TemplatesPage() {
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Template | null>(null);
  const [fullContent, setFullContent] = useState<{ id: string; content: string } | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/templates");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "加载失败");
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function viewContent(tpl: Template) {
    const res = await fetch(`/api/templates/${tpl.id}`);
    const data = await res.json();
    if (res.ok) setFullContent({ id: tpl.id, content: data.content });
  }

  async function toggleActive(tpl: Template) {
    await fetch(`/api/templates/${tpl.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !tpl.isActive }),
    });
    load();
  }

  return (
    <div className="space-y-6">
      <header className="panel-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">合同模板</h1>
          <p className="mt-1 text-sm text-slate-600">管理借款合同模板与变量</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-soft rounded-lg px-3 py-2 text-sm">刷新</button>
          <button onClick={() => { setEditItem(null); setShowForm(true); }} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800">新增模板</button>
        </div>
      </header>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {showForm && <TemplateForm item={editItem} onClose={() => setShowForm(false)} onSaved={load} />}

      {fullContent && (
        <section className="panel-soft rounded-xl p-5 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">模板内容预览</h2>
            <button onClick={() => setFullContent(null)} className="btn-soft rounded-lg px-3 py-1 text-sm">关闭</button>
          </div>
          <div className="prose prose-sm max-w-none rounded-lg border border-slate-200 bg-white p-4" dangerouslySetInnerHTML={{ __html: fullContent.content }} />
        </section>
      )}

      <section className="table-shell overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-3">名称</th>
                <th className="px-4 py-3">编码</th>
                <th className="px-4 py-3">变量</th>
                <th className="px-4 py-3">版本</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">加载中...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">暂无模板</td></tr>
              ) : items.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-slate-900">{t.name}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{t.code}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{t.variables.length ? t.variables.join(", ") : "-"}</td>
                  <td className="px-4 py-3 text-slate-700">v{t.version}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${t.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                      {t.isActive ? "启用" : "停用"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => viewContent(t)} className="text-blue-600 hover:underline">预览</button>
                      <button onClick={() => { setEditItem(t); setShowForm(true); }} className="text-blue-600 hover:underline">编辑</button>
                      <button onClick={() => toggleActive(t)} className="text-slate-500 hover:underline">{t.isActive ? "停用" : "启用"}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function TemplateForm({ item, onClose, onSaved }: { item: Template | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!item;
  const [form, setForm] = useState({ name: item?.name ?? "", code: item?.code ?? "", content: "", variables: item?.variables?.join(", ") ?? "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // 编辑时加载完整 content
  useEffect(() => {
    if (isEdit && item) {
      fetch(`/api/templates/${item.id}`).then((r) => r.json()).then((d) => {
        if (d.content) setForm((f) => ({ ...f, content: d.content }));
      });
    }
  }, [isEdit, item]);

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const payload = {
        name: form.name,
        ...(isEdit ? {} : { code: form.code }),
        content: form.content,
        variables: form.variables.split(",").map((s) => s.trim()).filter(Boolean),
      };
      const url = isEdit ? `/api/templates/${item!.id}` : "/api/templates";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存失败");
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel-soft rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">{isEdit ? "编辑模板" : "新增模板"}</h2>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block"><span className="text-sm text-slate-600">模板名称</span>
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="block"><span className="text-sm text-slate-600">模板编码</span>
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={isEdit} /></label>
        <label className="block md:col-span-2"><span className="text-sm text-slate-600">变量 (逗号分隔)</span>
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.variables} onChange={(e) => setForm({ ...form, variables: e.target.value })} placeholder="borrower_name, loan_amount, ..." /></label>
      </div>
      <label className="block"><span className="text-sm text-slate-600">模板内容 (HTML)</span>
        <textarea className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" rows={10} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></label>
      <div className="flex gap-3 pt-2">
        <button onClick={submit} disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50">{saving ? "保存中..." : "保存"}</button>
        <button onClick={onClose} className="btn-soft rounded-lg px-4 py-2 text-sm">取消</button>
      </div>
    </div>
  );
}
