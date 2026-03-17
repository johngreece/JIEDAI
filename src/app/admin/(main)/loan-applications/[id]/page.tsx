"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getStatusBadgeClass, getStatusLabel } from "@/lib/status-ui";

type Detail = {
  id: string;
  applicationNo: string;
  status: string;
  amount: number;
  termValue: number;
  termUnit: string;
  purpose: string | null;
  remark: string | null;
  riskScore: number | null;
  riskComment: string | null;
  totalApprovedAmount: number | null;
  rejectedReason: string | null;
  customer: { id: string; name: string; phone: string; idNumber: string };
  product: { id: string; name: string };
  approvals: Array<{ id: string; action: string; comment: string | null; approvedAmount: number | null; createdAt: string; approver: { username: string; realName: string } }>;
  disbursement: null | { id: string; disbursementNo: string; status: string; amount: number; netAmount: number };
};

export default function LoanApplicationDetailPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ amount: "", termValue: "", termUnit: "MONTH", purpose: "", remark: "" });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/loan-applications/${params.id}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "加载失败");
      setData(json);
      setForm({
        amount: String(json.amount ?? ""),
        termValue: String(json.termValue ?? ""),
        termUnit: json.termUnit ?? "MONTH",
        purpose: json.purpose ?? "",
        remark: json.remark ?? "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const editable = useMemo(() => data ? ["DRAFT", "REJECTED"].includes(data.status) : false, [data]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/loan-applications/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(form.amount),
          termValue: Number(form.termValue),
          termUnit: form.termUnit,
          purpose: form.purpose,
          remark: form.remark,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "保存失败");
      await load();
      alert("保存成功");
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function postAction(url: string, payload?: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "操作失败");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "操作失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-4">加载中...</div>;
  if (error || !data) return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error || "数据不存在"}</div>;

  return (
    <div className="space-y-6">
      <header className="panel-soft flex flex-wrap items-start justify-between gap-3 rounded-2xl px-5 py-4">
        <div>
          <div className="text-sm text-slate-500">借款申请详情</div>
          <h1 className="text-2xl font-bold text-slate-900">{data.applicationNo}</h1>
          <div className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs ${getStatusBadgeClass(data.status)}`}>{getStatusLabel(data.status)}</div>
        </div>
        <Link href="/admin/loan-applications" className="text-sm text-blue-600 hover:underline">返回列表</Link>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="panel-soft rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-slate-900">申请信息</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="space-y-1"><span className="text-slate-500">金额</span><input disabled={!editable || saving} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="input-base" /></label>
            <label className="space-y-1"><span className="text-slate-500">期限值</span><input disabled={!editable || saving} value={form.termValue} onChange={(e) => setForm((f) => ({ ...f, termValue: e.target.value }))} className="input-base" /></label>
            <label className="space-y-1"><span className="text-slate-500">期限单位</span><input disabled={!editable || saving} value={form.termUnit} onChange={(e) => setForm((f) => ({ ...f, termUnit: e.target.value }))} className="input-base" /></label>
            <label className="space-y-1"><span className="text-slate-500">用途</span><input disabled={!editable || saving} value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} className="input-base" /></label>
          </div>
          <label className="space-y-1 block"><span className="text-sm text-slate-500">备注</span><textarea disabled={!editable || saving} value={form.remark} onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))} className="input-base min-h-24" /></label>
          {editable ? (
            <button disabled={saving} onClick={save} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">保存编辑</button>
          ) : null}
        </div>

        <div className="panel-soft rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-slate-900">客户与产品</h2>
          <p className="text-sm text-slate-700">客户：{data.customer.name}（{data.customer.phone}）</p>
          <p className="text-sm text-slate-700">证件号：{data.customer.idNumber}</p>
          <p className="text-sm text-slate-700">产品：{data.product.name}</p>
          {data.riskScore != null ? <p className="text-sm text-slate-700">风控分：{data.riskScore}</p> : null}
          {data.rejectedReason ? <p className="text-sm text-red-700">拒绝原因：{data.rejectedReason}</p> : null}
          {data.totalApprovedAmount != null ? <p className="text-sm text-emerald-700">审批金额：¥ {data.totalApprovedAmount.toFixed(2)}</p> : null}
        </div>
      </section>

      <section className="panel-soft rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-slate-900">审批动作</h2>
        <div className="flex flex-wrap gap-2">
          {(data.status === "DRAFT" || data.status === "REJECTED") && (
            <button disabled={saving} onClick={() => postAction(`/api/loan-applications/${params.id}/submit`)} className="btn-soft px-3 py-1.5 text-sm">提交风控</button>
          )}
          {data.status === "PENDING_RISK" && (
            <>
              <button disabled={saving} onClick={() => postAction(`/api/loan-applications/${params.id}/risk`, { action: "PASS", comment: "详情页通过" })} className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50">风控通过</button>
              <button disabled={saving} onClick={() => postAction(`/api/loan-applications/${params.id}/risk`, { action: "REJECT", comment: "详情页拒绝" })} className="btn-danger px-3 py-1.5 text-sm disabled:opacity-50">风控拒绝</button>
            </>
          )}
          {data.status === "PENDING_APPROVAL" && (
            <>
              <button disabled={saving} onClick={() => postAction(`/api/loan-applications/${params.id}/approve`, { action: "APPROVE" })} className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50">审批通过</button>
              <button disabled={saving} onClick={() => postAction(`/api/loan-applications/${params.id}/approve`, { action: "REJECT", comment: "审批拒绝" })} className="btn-danger px-3 py-1.5 text-sm disabled:opacity-50">审批拒绝</button>
            </>
          )}
        </div>
      </section>

      <section className="table-shell rounded-xl p-4">
        <h2 className="font-semibold text-slate-900 mb-3">审批历史</h2>
        {data.approvals.length === 0 ? (
          <p className="text-sm text-slate-500">暂无审批记录</p>
        ) : (
          <ul className="space-y-2">
            {data.approvals.map((a) => (
              <li key={a.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
                <div className="font-medium text-slate-800">{a.action}</div>
                <div className="text-slate-600">{a.approver.realName || a.approver.username} · {new Date(a.createdAt).toLocaleString()}</div>
                {a.comment ? <div className="text-slate-700 mt-1">备注：{a.comment}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
