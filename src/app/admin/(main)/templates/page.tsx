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

  useEffect(() => {
    void load();
  }, []);

  async function viewContent(template: Template) {
    const res = await fetch(`/api/templates/${template.id}`);
    const data = await res.json();
    if (res.ok) setFullContent({ id: template.id, content: data.content });
  }

  async function toggleActive(template: Template) {
    await fetch(`/api/templates/${template.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !template.isActive }),
    });
    await load();
  }

  return (
    <div className="space-y-6">
      <header className="panel-soft admin-page-header">
        <div className="admin-page-header__meta">
          <span className="admin-page-header__eyebrow">Templates</span>
          <h1 className="admin-page-header__title">合同模板</h1>
          <p className="admin-page-header__description">管理借款合同模板、变量占位符和模板版本，保障前台生成文案统一。</p>
        </div>
        <div className="admin-toolbar-group">
          <button onClick={load} className="admin-btn admin-btn-secondary">刷新</button>
          <button onClick={() => { setEditItem(null); setShowForm(true); }} className="admin-btn admin-btn-primary">新增模板</button>
        </div>
      </header>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {showForm ? <TemplateForm item={editItem} onClose={() => setShowForm(false)} onSaved={load} /> : null}

      {fullContent ? (
        <section className="admin-section-card">
          <div className="admin-section-card__header">
            <div>
              <div className="admin-section-card__title">模板内容预览</div>
              <p className="admin-section-card__description">用于快速确认 HTML 模板结构、变量和最终排版。</p>
            </div>
            <button onClick={() => setFullContent(null)} className="admin-btn admin-btn-secondary admin-btn-sm">关闭</button>
          </div>
          <div className="admin-section-card__body">
            <div className="prose prose-sm max-w-none rounded-[1.2rem] border border-slate-200 bg-white p-4" dangerouslySetInnerHTML={{ __html: fullContent.content }} />
          </div>
        </section>
      ) : null}

      <section className="table-shell admin-table-shell">
        <div className="admin-table-toolbar">
          <div>
            <div className="admin-table-title">模板列表</div>
            <p className="admin-table-note">支持预览、编辑和启停模板，便于合同与通知文案统一管理。</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
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
              ) : (
                items.map((template) => (
                  <tr key={template.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{template.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{template.code}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{template.variables.length ? template.variables.join(", ") : "-"}</td>
                    <td className="px-4 py-3 text-slate-700">v{template.version}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${template.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                        {template.isActive ? "启用" : "停用"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="admin-btn-group">
                        <button onClick={() => viewContent(template)} className="text-blue-600 hover:underline">预览</button>
                        <button onClick={() => { setEditItem(template); setShowForm(true); }} className="text-blue-600 hover:underline">编辑</button>
                        <button onClick={() => toggleActive(template)} className="text-slate-500 hover:underline">{template.isActive ? "停用" : "启用"}</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
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

  useEffect(() => {
    if (isEdit && item) {
      fetch(`/api/templates/${item.id}`).then((response) => response.json()).then((data) => {
        if (data.content) setForm((current) => ({ ...current, content: data.content }));
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
        variables: form.variables.split(",").map((itemValue) => itemValue.trim()).filter(Boolean),
      };
      const url = isEdit ? `/api/templates/${item!.id}` : "/api/templates";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存失败");
      await onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-form-shell">
      <div className="admin-section-card__header -mx-5 -mt-5 mb-5 border-b border-slate-100 px-5">
        <div>
          <div className="admin-section-card__title">{isEdit ? "编辑模板" : "新增模板"}</div>
          <p className="admin-section-card__description">维护合同模板名称、编码、变量集合和 HTML 正文内容。</p>
        </div>
      </div>

      {err ? <p className="mb-4 text-sm text-red-600">{err}</p> : null}

      <div className="admin-form-grid md:grid-cols-2">
        <Field label="模板名称" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
        <Field label="模板编码" value={form.code} disabled={isEdit} onChange={(value) => setForm((current) => ({ ...current, code: value }))} />
        <div className="md:col-span-2">
          <Field label="变量 (逗号分隔)" value={form.variables} onChange={(value) => setForm((current) => ({ ...current, variables: value }))} placeholder="borrower_name, loan_amount, due_date" />
        </div>
      </div>

      <label className="mt-4 block text-sm">
        <span className="mb-1 block font-medium text-slate-700">模板内容 (HTML)</span>
        <textarea className="admin-field min-h-[260px] font-mono" rows={12} value={form.content} onChange={(e) => setForm((current) => ({ ...current, content: e.target.value }))} />
      </label>

      <div className="mt-5 admin-btn-group">
        <button onClick={submit} disabled={saving} className="admin-btn admin-btn-primary">{saving ? "保存中..." : "保存"}</button>
        <button onClick={onClose} className="admin-btn admin-btn-secondary">取消</button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, disabled = false, placeholder }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; placeholder?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <input className="admin-field" value={value} disabled={disabled} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
