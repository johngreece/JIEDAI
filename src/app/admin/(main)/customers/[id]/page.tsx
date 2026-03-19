"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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
  kyc: { id: string; kycType: string; status: string; verifiedAt: string | null }[];
  loanApplications: { id: string; applicationNo: string; amount: number; status: string; createdAt: string }[];
};

type CreditInfo = {
  creditLimit: number;
  creditLimitOverride: number | null;
  effectiveLimit: number;
  baseLimit: number;
  allDocumentsUploaded: boolean;
  documents: { kycType: string; status: string; hasDocument: boolean; createdAt: string }[];
};

type DocItem = {
  id: string;
  kycType: string;
  documentUrl: string;
  status: string;
  verifiedAt: string | null;
  createdAt: string;
};

const RISK_OPTIONS = ["LOW", "NORMAL", "HIGH", "BLACKLIST"];
const RISK_LABELS: Record<string, string> = { LOW: "低风险", NORMAL: "正常", HIGH: "高风险", BLACKLIST: "黑名单" };
const KYC_TYPE_LABELS: Record<string, string> = { PASSPORT: "护照", CHINA_ID: "国内身份证", GREEK_RESIDENCE_PERMIT: "希腊居留卡" };
const DOC_TYPES = ["PASSPORT", "CHINA_ID", "GREEK_RESIDENCE_PERMIT"] as const;
const STATUS_STYLES: Record<string, string> = {
  UPLOADED: "bg-blue-50 text-blue-600",
  VERIFIED: "bg-emerald-50 text-emerald-600",
  REJECTED: "bg-red-50 text-red-600",
  PENDING: "bg-slate-100 text-slate-500",
};
const STATUS_LABELS: Record<string, string> = {
  UPLOADED: "已上传", VERIFIED: "已验证", REJECTED: "已驳回", PENDING: "待上传",
};

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [data, setData] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState("");
  const [credit, setCredit] = useState<CreditInfo | null>(null);
  const [creditOverride, setCreditOverride] = useState("");
  const [creditSaving, setCreditSaving] = useState(false);
  const [creditMsg, setCreditMsg] = useState("");

  // 证件管理
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadMsg, setUploadMsg] = useState("");
  const [previewDoc, setPreviewDoc] = useState<DocItem | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
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
  }, [id]);

  const loadCredit = useCallback(async () => {
    try {
      const res = await fetch(`/api/customers/${id}/credit-limit`);
      if (res.ok) {
        const json = await res.json();
        setCredit(json);
        setCreditOverride(json.creditLimitOverride != null ? String(json.creditLimitOverride) : "");
      }
    } catch { /* ignore */ }
  }, [id]);

  const loadDocs = useCallback(async () => {
    try {
      const res = await fetch(`/api/customers/${id}/documents`);
      if (res.ok) {
        const json = await res.json();
        setDocs(json.documents || []);
      }
    } catch { /* ignore */ }
  }, [id]);

  useEffect(() => { load(); loadCredit(); loadDocs(); }, [load, loadCredit, loadDocs]);

  async function saveCreditOverride(e: React.FormEvent) {
    e.preventDefault();
    setCreditSaving(true);
    setCreditMsg("");
    try {
      const val = creditOverride.trim() === "" ? null : Number(creditOverride);
      const res = await fetch(`/api/customers/${id}/credit-limit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creditLimitOverride: val }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "保存失败");
      setCreditMsg("额度已更新");
      loadCredit();
    } catch (e) {
      setCreditMsg(e instanceof Error ? e.message : "保存失败");
    } finally {
      setCreditSaving(false);
    }
  }

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

  async function handleUpload(kycType: string, file: File) {
    setUploading(kycType);
    setUploadMsg("");
    try {
      const fd = new FormData();
      fd.append("kycType", kycType);
      fd.append("file", file);
      const res = await fetch(`/api/customers/${id}/documents`, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "上传失败");
      setUploadMsg(`${KYC_TYPE_LABELS[kycType]} 上传成功`);
      loadDocs();
      loadCredit();
      load();
    } catch (e) {
      setUploadMsg(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(null);
    }
  }

  function handleDownload(doc: DocItem) {
    const link = document.createElement("a");
    link.href = doc.documentUrl;
    const ext = doc.documentUrl.startsWith("data:application/pdf") ? "pdf" : "jpg";
    link.download = `${data?.name ?? "客户"}_${KYC_TYPE_LABELS[doc.kycType]}.${ext}`;
    link.click();
  }

  function getDocByType(type: string) {
    return docs.find((d) => d.kycType === type);
  }

  if (loading) return <div className="p-8 text-center text-slate-400">加载中...</div>;
  if (!data) return <div className="p-8 text-center text-slate-400">客户不存在</div>;

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) { setPwdMsg("密码至少6位"); return; }
    setPwdSaving(true);
    setPwdMsg("");
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "重置失败");
      setPwdMsg("密码已重置成功");
      setNewPassword("");
    } catch (e) {
      setPwdMsg(e instanceof Error ? e.message : "重置失败");
    } finally {
      setPwdSaving(false);
    }
  }

  const uploadedCount = DOC_TYPES.filter((t) => getDocByType(t)).length;

  return (
    <div className="space-y-6">
      {/* 顶部头部 */}
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
          {/* 基本信息 */}
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

          {/* ═══════ 证件管理（上传/下载/预览） ═══════ */}
          <section className="panel-soft rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">证件管理</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  已上传 {uploadedCount}/{DOC_TYPES.length} 种证件
                  {uploadedCount === DOC_TYPES.length && <span className="ml-2 text-emerald-600 font-medium">✓ 全部齐全</span>}
                </p>
              </div>
            </div>
            {uploadMsg && (
              <p className={`text-xs mb-3 rounded-lg px-3 py-2 ${uploadMsg.includes("成功") ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>{uploadMsg}</p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {DOC_TYPES.map((type) => {
                const doc = getDocByType(type);
                const isUploading = uploading === type;
                const isPdf = doc?.documentUrl?.startsWith("data:application/pdf");

                return (
                  <div key={type} className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                    {/* 预览区域 */}
                    <div
                      className="relative h-48 bg-slate-50 flex items-center justify-center cursor-pointer group"
                      onClick={() => doc && setPreviewDoc(doc)}
                    >
                      {doc ? (
                        isPdf ? (
                          <div className="text-center">
                            <svg className="mx-auto h-16 w-16 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zm-3 9h4v2h-4v-2zm0 3h4v2h-4v-2zm-2-6h2v8H8v-8z"/>
                            </svg>
                            <p className="mt-1 text-xs text-slate-500">PDF 文件</p>
                          </div>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={doc.documentUrl}
                            alt={KYC_TYPE_LABELS[type]}
                            className="h-full w-full object-cover group-hover:opacity-80 transition-opacity"
                          />
                        )
                      ) : (
                        <div className="text-center text-slate-300">
                          <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"/>
                          </svg>
                          <p className="mt-1 text-xs">未上传</p>
                        </div>
                      )}
                      {doc && (
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="bg-black/60 text-white text-xs px-2 py-1 rounded">点击预览</span>
                        </div>
                      )}
                    </div>

                    {/* 信息 + 操作 */}
                    <div className="p-3 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm text-slate-800">{KYC_TYPE_LABELS[type]}</span>
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[doc?.status ?? "PENDING"]}`}>
                          {STATUS_LABELS[doc?.status ?? "PENDING"]}
                        </span>
                      </div>
                      {doc && (
                        <p className="text-xs text-slate-400 mb-2">
                          上传于 {new Date(doc.createdAt).toLocaleString()}
                        </p>
                      )}
                      <div className="flex gap-2">
                        {/* 上传按钮 */}
                        <input
                          ref={(el) => { fileInputRefs.current[type] = el; }}
                          type="file"
                          className="hidden"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleUpload(type, f);
                            e.target.value = "";
                          }}
                        />
                        <button
                          onClick={() => fileInputRefs.current[type]?.click()}
                          disabled={isUploading}
                          className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {isUploading ? (
                            <span className="animate-pulse">上传中...</span>
                          ) : (
                            <>{doc ? "重新上传" : "上传"}</>
                          )}
                        </button>
                        {/* 下载按钮 */}
                        {doc && (
                          <button
                            onClick={() => handleDownload(doc)}
                            className="flex items-center justify-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                            title="下载"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                            下载
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ═══════ 预览弹窗 ═══════ */}
          {previewDoc && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setPreviewDoc(null)}>
              <div className="relative max-h-[90vh] max-w-[90vw] bg-white rounded-xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <h3 className="font-semibold text-slate-800">{KYC_TYPE_LABELS[previewDoc.kycType]} — {data.name}</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDownload(previewDoc)}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white hover:bg-slate-800"
                    >
                      下载文件
                    </button>
                    <button onClick={() => setPreviewDoc(null)} className="rounded p-1 hover:bg-slate-100">
                      <svg className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="overflow-auto max-h-[80vh] p-2 bg-slate-50 flex items-center justify-center">
                  {previewDoc.documentUrl.startsWith("data:application/pdf") ? (
                    <iframe src={previewDoc.documentUrl} className="w-[800px] h-[75vh] border-0" title="PDF预览" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewDoc.documentUrl} alt={KYC_TYPE_LABELS[previewDoc.kycType]} className="max-w-full max-h-[75vh] object-contain" />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 额度管理 */}
          <section className="panel-soft rounded-xl p-5">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">额度管理</h2>
            {credit ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">基础额度</p>
                    <p className="text-lg font-bold text-slate-800">€{credit.baseLimit.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">生效额度</p>
                    <p className="text-lg font-bold text-cyan-700">€{credit.effectiveLimit.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">特殊额度</p>
                    <p className="text-lg font-bold text-amber-600">{credit.creditLimitOverride != null ? `€${credit.creditLimitOverride.toLocaleString()}` : "未设置"}</p>
                  </div>
                  <div className="rounded-lg border bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">证件完成度</p>
                    <p className="text-lg font-bold">{credit.allDocumentsUploaded ? <span className="text-emerald-600">全部完成</span> : <span className="text-amber-600">{uploadedCount}/3</span>}</p>
                  </div>
                </div>
                <form onSubmit={saveCreditOverride} className="flex gap-2 items-end border-t pt-4">
                  <div className="flex-1">
                    <label className="text-sm text-slate-600">设置特殊额度（留空=使用系统计算额度）</label>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      placeholder="例如 50000"
                      value={creditOverride}
                      onChange={(e) => setCreditOverride(e.target.value)}
                      min="0"
                      step="1000"
                    />
                  </div>
                  <button type="submit" disabled={creditSaving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap">
                    {creditSaving ? "保存中..." : "保存额度"}
                  </button>
                  {credit.creditLimitOverride != null && (
                    <button type="button" onClick={async () => {
                      setCreditSaving(true); setCreditMsg("");
                      try {
                        const res = await fetch(`/api/customers/${id}/credit-limit`, {
                          method: "PATCH", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ creditLimitOverride: null }),
                        });
                        if (!res.ok) throw new Error("清除失败");
                        setCreditOverride(""); setCreditMsg("额度已更新"); loadCredit();
                      } catch { setCreditMsg("清除失败"); } finally { setCreditSaving(false); }
                    }} className="btn-soft rounded-lg px-3 py-2 text-sm whitespace-nowrap">清除特殊额度</button>
                  )}
                </form>
                {creditMsg && <p className={`text-xs ${creditMsg.includes("已更新") ? "text-emerald-600" : "text-red-600"}`}>{creditMsg}</p>}
              </div>
            ) : (
              <p className="text-sm text-slate-400">加载中...</p>
            )}
          </section>

          {/* 重置密码 */}
          <section className="panel-soft rounded-xl p-5">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">重置登录密码</h2>
            <p className="text-xs text-slate-400 mb-3">为客户重新设置客户端登录密码（手机号 + 密码登录）</p>
            <form onSubmit={handleResetPassword} className="flex gap-2 items-end">
              <div className="flex-1">
                <input
                  type="password"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="新密码（至少6位）"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
              <button type="submit" disabled={pwdSaving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap">
                {pwdSaving ? "重置中..." : "重置密码"}
              </button>
            </form>
            {pwdMsg && <p className={`text-xs mt-2 ${pwdMsg.includes("成功") ? "text-emerald-600" : "text-red-600"}`}>{pwdMsg}</p>}
          </section>

          {/* 近期借款 */}
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
                      <td className="py-2">€{a.amount.toLocaleString()}</td>
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
