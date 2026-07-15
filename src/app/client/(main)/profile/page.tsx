"use client";

import { formatMoney as money } from "@/lib/system-config";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DocumentScanner } from "@/components/DocumentScanner";

type MissingField = { key: string; label: string };
type MissingDocType = { type: string; label: string };

type ProfileForm = {
  phone: string;
  address: string;
  taxNumber: string;
  idNumber: string;
  passportNumber: string;
  residencePermitNumber: string;
  residencePermitExpiry: string;
};

type DocType = {
  type: string;
  label: string;
  uploaded: boolean;
  verified: boolean;
};

type DocumentItem = {
  id: string;
  kycType: string;
  label: string;
  documentUrl: string | null;
  mimeType: string | null;
  status: string;
  remark: string | null;
  createdAt: string;
};

type ProfileData = {
  profile: ProfileForm & {
    id: string;
    name: string;
    profileCompletedAt: string | null;
  };
  documents: DocumentItem[];
  docTypes: DocType[];
  creditLimit: number;
  profileComplete: boolean;
  profileFieldsComplete: boolean;
  documentsComplete: boolean;
  missingFields: MissingField[];
  missingDocTypes: MissingDocType[];
};

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  UPLOADED: { label: "待核验", className: "bg-blue-50 text-blue-700" },
  VERIFIED: { label: "已验证", className: "bg-emerald-50 text-emerald-700" },
  REJECTED: { label: "已驳回", className: "bg-red-50 text-red-700" },
  PENDING: { label: "待核验", className: "bg-blue-50 text-blue-700" },
  MISSING: { label: "待上传", className: "bg-slate-100 text-slate-600" },
};

const EMPTY_FORM: ProfileForm = {
  phone: "",
  address: "",
  taxNumber: "",
  idNumber: "",
  passportNumber: "",
  residencePermitNumber: "",
  residencePermitExpiry: "",
};

export default function ClientProfilePage() {
  const searchParams = useSearchParams();
  const required = searchParams.get("required") === "1";
  const [data, setData] = useState<ProfileData | null>(null);
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [scanType, setScanType] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function fetchProfile() {
    setLoading(true);
    try {
      const response = await fetch("/api/client/profile", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "资料加载失败");
      setData(json);
      setForm({
        phone: json.profile.phone ?? "",
        address: json.profile.address ?? "",
        taxNumber: json.profile.taxNumber ?? "",
        idNumber: json.profile.idNumber ?? "",
        passportNumber: json.profile.passportNumber ?? "",
        residencePermitNumber: json.profile.residencePermitNumber ?? "",
        residencePermitExpiry: json.profile.residencePermitExpiry ?? "",
      });
    } catch (error) {
      setMessage({ type: "err", text: error instanceof Error ? error.message : "资料加载失败" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchProfile();
  }, []);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/client/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "保存失败");
      setData(json);
      setForm({
        phone: json.profile.phone ?? "",
        address: json.profile.address ?? "",
        taxNumber: json.profile.taxNumber ?? "",
        idNumber: json.profile.idNumber ?? "",
        passportNumber: json.profile.passportNumber ?? "",
        residencePermitNumber: json.profile.residencePermitNumber ?? "",
        residencePermitExpiry: json.profile.residencePermitExpiry ?? "",
      });
      setMessage({
        type: "ok",
        text: json.profileComplete ? "客户资料已补齐" : "资料已保存，请继续上传复印件",
      });
    } catch (error) {
      setMessage({ type: "err", text: error instanceof Error ? error.message : "保存失败" });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(kycType: string, file: File) {
    setUploading(kycType);
    setMessage(null);
    const formData = new FormData();
    formData.append("kycType", kycType);
    formData.append("file", file);

    try {
      const response = await fetch("/api/client/documents", { method: "POST", body: formData });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "上传失败");
      await fetchProfile();
      setMessage({
        type: "ok",
        text: json.profileComplete
          ? "资料和证件已全部核验完成"
          : `${json.label}已上传，等待内部核验`,
      });
    } catch (error) {
      setMessage({ type: "err", text: error instanceof Error ? error.message : "上传失败" });
    } finally {
      setUploading(null);
      setSelectedType(null);
    }
  }

  function setField(key: keyof ProfileForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function triggerFileSelect(type: string) {
    setSelectedType(type);
    fileInputRef.current?.click();
  }

  function getExistingDoc(type: string) {
    return data?.documents.find((document) => document.kycType === type) ?? null;
  }

  if (loading) {
    return <div className="py-16 text-center text-sm text-slate-500">资料加载中...</div>;
  }

  if (!data) {
    return <div className="py-16 text-center text-sm text-red-600">资料加载失败，请刷新重试</div>;
  }

  const completedItems =
    (data.profileFieldsComplete ? 1 : 0) +
    data.docTypes.filter((item) => item.verified).length;
  const totalItems = 1 + data.docTypes.length;
  const missingLabels = [
    ...data.missingFields.map((item) => item.label),
    ...data.missingDocTypes.map((item) => item.label),
  ];

  return (
    <div className="space-y-5">
      <header className="panel-soft rounded-xl px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Client Profile</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">资料认证</h1>
            <p className="mt-1 text-sm text-slate-600">
              {data.profile.name}，当前可用额度 {money(data.creditLimit)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-center">
              <div className="text-xs text-slate-500">完成项</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {completedItems}/{totalItems}
              </div>
            </div>
            <div
              className={`rounded-lg border px-4 py-3 text-center ${
                data.profileComplete
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              <div className="text-xs">状态</div>
              <div className="mt-1 text-lg font-bold">{data.profileComplete ? "已完成" : "待补齐"}</div>
            </div>
          </div>
        </div>
      </header>

      {(required || !data.profileComplete) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          客户端已开启强制资料认证，资料补齐且证件经内部核验通过后，才可以继续进入借款、还款和签署流程。
          {missingLabels.length > 0 ? (
            <span className="mt-1 block text-xs text-amber-700">待处理：{missingLabels.join("、")}</span>
          ) : null}
        </div>
      )}

      {message ? (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-medium ${
            message.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <section className="stat-tile rounded-xl p-4 sm:p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">客户信息</h2>
            <p className="text-sm text-slate-500">地址、电话、税号、身份证、护照和居留信息必须完整。</p>
          </div>
          {data.profile.profileCompletedAt ? (
            <span className="text-xs text-slate-500">
              完成于 {new Date(data.profile.profileCompletedAt).toLocaleString("zh-CN")}
            </span>
          ) : null}
        </div>

        <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={saveProfile}>
          <Field label="电话" required missing={data.missingFields.some((item) => item.key === "phone")}>
            <input
              className="input-base"
              value={form.phone}
              onChange={(event) => setField("phone", event.target.value)}
              placeholder="+30..."
              required
            />
          </Field>
          <Field label="税号" required missing={data.missingFields.some((item) => item.key === "taxNumber")}>
            <input
              className="input-base"
              value={form.taxNumber}
              onChange={(event) => setField("taxNumber", event.target.value)}
              required
            />
          </Field>
          <Field label="身份证号" required missing={data.missingFields.some((item) => item.key === "idNumber")}>
            <input
              className="input-base"
              value={form.idNumber}
              onChange={(event) => setField("idNumber", event.target.value)}
              required
            />
          </Field>
          <Field label="护照号" required missing={data.missingFields.some((item) => item.key === "passportNumber")}>
            <input
              className="input-base"
              value={form.passportNumber}
              onChange={(event) => setField("passportNumber", event.target.value)}
              required
            />
          </Field>
          <Field label="居留卡号" required missing={data.missingFields.some((item) => item.key === "residencePermitNumber")}>
            <input
              className="input-base"
              value={form.residencePermitNumber}
              onChange={(event) => setField("residencePermitNumber", event.target.value)}
              required
            />
          </Field>
          <Field label="居留有效期" required missing={data.missingFields.some((item) => item.key === "residencePermitExpiry")}>
            <input
              className="input-base"
              type="date"
              value={form.residencePermitExpiry}
              onChange={(event) => setField("residencePermitExpiry", event.target.value)}
              required
            />
          </Field>
          <Field label="地址" required missing={data.missingFields.some((item) => item.key === "address")} className="md:col-span-2">
            <textarea
              className="input-base min-h-24"
              value={form.address}
              onChange={(event) => setField("address", event.target.value)}
              required
            />
          </Field>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {saving ? "保存中..." : "保存客户信息"}
            </button>
          </div>
        </form>
      </section>

      <section className="stat-tile rounded-xl p-4 sm:p-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">复印件上传</h2>
          <p className="text-sm text-slate-500">身份证、护照、居留卡复印件必须全部上传并通过内部核验。</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file && selectedType) void handleUpload(selectedType, file);
            event.target.value = "";
          }}
        />

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {data.docTypes.map((docType) => {
            const document = getExistingDoc(docType.type);
            const status = STATUS_MAP[document?.status ?? "MISSING"] ?? STATUS_MAP.PENDING;
            const isUploading = uploading === docType.type;
            const isMissing = data.missingDocTypes.some((item) => item.type === docType.type);

            return (
              <div
                key={docType.type}
                className={`rounded-lg border p-4 ${
                  isMissing ? "border-amber-200 bg-amber-50/60" : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">{docType.label}</h3>
                    <span className={`mt-2 inline-flex rounded px-2 py-1 text-xs font-medium ${status.className}`}>
                      {status.label}
                    </span>
                  </div>
                  {isMissing ? <span className="text-xs font-semibold text-amber-700">待处理</span> : null}
                </div>

                {document?.documentUrl && document.mimeType?.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={document.documentUrl}
                    alt={docType.label}
                    className="mt-3 h-32 w-full rounded-lg border border-slate-200 object-cover"
                  />
                ) : document?.documentUrl && document.mimeType === "application/pdf" ? (
                  <div className="mt-3 flex h-32 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
                    PDF 文件
                  </div>
                ) : (
                  <div className="mt-3 flex h-32 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-400">
                    未上传
                  </div>
                )}

                {document ? (
                  <p className="mt-2 text-xs text-slate-500">
                    上传于 {new Date(document.createdAt).toLocaleString("zh-CN")}
                  </p>
                ) : null}
                {document?.status === "REJECTED" && document.remark ? (
                  <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                    驳回原因：{document.remark}
                  </p>
                ) : null}

                <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                  <button
                    type="button"
                    onClick={() => triggerFileSelect(docType.type)}
                    disabled={isUploading}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    {isUploading ? "上传中..." : document ? "重新上传" : "上传文件"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setScanType(docType.type)}
                    disabled={isUploading}
                    className="rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-2 text-sm font-medium text-cyan-700 transition hover:bg-cyan-100 disabled:opacity-60"
                    title="拍照上传"
                  >
                    拍照
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {scanType ? (
        <DocumentScanner
          onCapture={(file) => {
            const currentType = scanType;
            setScanType(null);
            void handleUpload(currentType, file);
          }}
          onClose={() => setScanType(null)}
        />
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
  required,
  missing,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  missing?: boolean;
  className?: string;
}) {
  return (
    <label className={`space-y-1.5 text-sm ${className}`}>
      <span className="flex items-center gap-2 text-slate-600">
        {label}
        {required ? <span className="text-red-500">*</span> : null}
        {missing ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">待补</span> : null}
      </span>
      {children}
    </label>
  );
}
