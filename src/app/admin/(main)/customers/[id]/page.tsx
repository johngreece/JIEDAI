"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type CustomerDetail = {
  id: string;
  name: string;
  phone: string;
  idType: string;
  idNumber: string;
  email: string | null;
  address: string | null;
  emergencyContact: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  bankAccount: string | null;
  bankName: string | null;
  riskLevel: string;
  source: string | null;
  remark: string | null;
  createdAt: string;
  kyc: { id: string; kycType: string; status: string; verifiedAt: string | null } | null;
  loanApplications: { id: string; applicationNo: string; amount: number; status: string; createdAt: string }[];
};

const RISK_OPTIONS = ["LOW", "NORMAL", "HIGH", "BLACKLIST"];
const RISK_LABELS: Record<string, string> = { LOW: "低风险", NORMAL: "正常", HIGH: "高风险", BLACKLIST: "黑名单" };

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [data, setData] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/customers/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function startEdit() {
    if (!data) return;
    setForm({
      name: data.name,
      phone: data.phone,
      email: data.email ?? "",
      address: data.address ?? "",
      emergencyContact: data.emergencyContact ?? "",
      emergencyContactPhone: data.emergencyContactPhone ?? "",
      bankAccount: data.bankAccount ?? "",
      bankName: data.bankName ?? "",
      riskLevel: data.riskLevel,
      remark: data.remark ?? "",
    });
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setEditing(false);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-slate-400">加载中...</div>;
  if (!data) return <div className="p-8 text-center text-slate-400">客户不存在</div>;

  return (
    <div className="space-y-6">
      <header className="panel-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">客户详情</h1>
          <p className="mt-1 text-sm text-slate-600">{data.name} · {data.phone}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.back()} className="btn-soft rounded-lg px-3 py-2 text-sm">返回</button>
          {!editing && <button onClick={startEdit} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800">编辑</button>}
        </div>
      </header>

      {editing ? (
        <section className="panel-soft rounded-xl p-5 space-y-4">
          <h2 className="text-lg font-semibold">编辑客户信息</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {([
              ["name", "姓名"], ["phone", "手机号"], ["email", "邮箱"], ["address", "地址"],
              ["emergencyContact", "紧急联系人"], ["emergencyContactPhone", "紧急联系人电话"],
              ["bankAccount", "银行账号"], ["bankName", "开户行"],
            ] as const).map(([key, label]) => (
              <label key={key} className="block"><span className="text-sm text-slate-600">{label}</span>
                <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
              </label>
            ))}
            <label className="block"><span className="text-sm text-slate-600">风险等级</span>
              <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.riskLevel} onChange={(e) => setForm({ ...form, riskLevel: e.target.value })}>
                {RISK_OPTIONS.map((r) => <option key={r} value={r}>{RISK_LABELS[r]}</option>)}
              </select></label>
            <label className="block"><span className="text-sm text-slate-600">备注</span>
              <textarea className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={2} value={form.remark ?? ""} onChange={(e) => setForm({ ...form, remark: e.target.value })} /></label>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={saveEdit} disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50">{saving ? "保存中..." : "保存"}</button>
            <button onClick={() => setEditing(false)} className="btn-soft rounded-lg px-4 py-2 text-sm">取消</button>
          </div>
        </section>
      ) : (
        <>
          <section className="panel-soft rounded-xl p-5">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">基本信息</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-y-3 gap-x-6 text-sm">
              {([
                ["姓名", data.name], ["手机号", data.phone], ["证件类型", data.idType === "ID_CARD" ? "身份证" : data.idType],
                ["证件号", data.idNumber], ["邮箱", data.email ?? "-"], ["地址", data.address ?? "-"],
                ["紧急联系人", data.emergencyContact ?? "-"], ["联系人电话", data.emergencyContactPhone ?? "-"],
                ["银行账号", data.bankAccount ?? "-"], ["开户行", data.bankName ?? "-"],
                ["风险等级", RISK_LABELS[data.riskLevel] ?? data.riskLevel], ["来源", data.source ?? "-"],
                ["注册时间", new Date(data.createdAt).toLocaleString()],
              ] as const).map(([label, val]) => (
                <div key={label}><span className="text-slate-500">{label}：</span><span className="text-slate-900">{val}</span></div>
              ))}
            </div>
            {data.remark && <p className="mt-3 text-sm text-slate-500">备注：{data.remark}</p>}
          </section>

          {data.kyc && (
            <section className="panel-soft rounded-xl p-5">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">KYC 认证</h2>
              <div className="text-sm space-y-1">
                <p>类型：{data.kyc.kycType}</p>
                <p>状态：{data.kyc.status}</p>
                {data.kyc.verifiedAt && <p>认证时间：{new Date(data.kyc.verifiedAt).toLocaleString()}</p>}
              </div>
            </section>
          )}

          {data.loanApplications.length > 0 && (
            <section className="panel-soft rounded-xl p-5">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">近期借款</h2>
              <table className="min-w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-500 border-b">
                  <th className="py-2">申请编号</th><th className="py-2">金额</th><th className="py-2">状态</th><th className="py-2">时间</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.loanApplications.map((a) => (
                    <tr key={a.id}>
                      <td className="py-2"><Link href={`/admin/loan-applications/${a.id}`} className="text-blue-600 hover:underline">{a.applicationNo}</Link></td>
                      <td className="py-2">¥{a.amount.toLocaleString()}</td>
                      <td className="py-2">{a.status}</td>
                      <td className="py-2 text-slate-500">{new Date(a.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  );
}
