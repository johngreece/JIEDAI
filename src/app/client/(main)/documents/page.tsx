"use client";

import { useEffect, useState, useRef } from "react";
import { DocumentScanner } from "@/components/DocumentScanner";

interface DocType {
  type: string;
  label: string;
  uploaded: boolean;
}

interface Document {
  id: string;
  kycType: string;
  label: string;
  documentUrl: string | null;
  status: string;
  createdAt: string;
}

interface DocsData {
  documents: Document[];
  creditLimit: number;
  allDocumentsUploaded: boolean;
  docTypes: DocType[];
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  UPLOADED: { label: "已上传", color: "text-blue-600 bg-blue-50" },
  VERIFIED: { label: "已验证", color: "text-emerald-600 bg-emerald-50" },
  REJECTED: { label: "已驳回", color: "text-red-600 bg-red-50" },
  PENDING: { label: "待上传", color: "text-slate-500 bg-slate-100" },
};

export default function DocumentsPage() {
  const [data, setData] = useState<DocsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [scanType, setScanType] = useState<string | null>(null);

  const fetchDocs = async () => {
    const res = await fetch("/api/client/documents");
    if (res.ok) setData(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchDocs(); }, []);

  const handleUpload = async (kycType: string, file: File) => {
    setUploading(kycType);
    setMsg(null);
    const formData = new FormData();
    formData.append("kycType", kycType);
    formData.append("file", file);
    const res = await fetch("/api/client/documents", { method: "POST", body: formData });
    const json = await res.json();
    if (res.ok) {
      setMsg({ type: "ok", text: `${json.label} 上传成功！` });
      fetchDocs();
    } else {
      setMsg({ type: "err", text: json.error || "上传失败" });
    }
    setUploading(null);
    setSelectedType(null);
  };

  const triggerFileSelect = (type: string) => {
    setSelectedType(type);
    fileInputRef.current?.click();
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && selectedType) {
      handleUpload(selectedType, file);
    }
    e.target.value = "";
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-slate-500">加载中...</div>;
  }

  if (!data) {
    return <div className="py-20 text-center text-red-500">加载失败，请刷新重试</div>;
  }

  const getExistingDoc = (type: string) => data.documents.find((d) => d.kycType === type);

  return (
    <div className="space-y-6">
      {/* Header with credit limit */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">我的证件</h1>
          <p className="mt-1 text-sm text-slate-500">上传您的证件以提升借款额度</p>
        </div>
        <div className="rounded-xl border border-cyan-200 bg-gradient-to-r from-cyan-50 to-blue-50 p-4 text-center shadow-sm">
          <p className="text-xs text-slate-500">当前可用额度</p>
          <p className="text-2xl font-bold text-cyan-700">€{data.creditLimit.toLocaleString()}</p>
          {!data.allDocumentsUploaded && (
            <p className="mt-1 text-xs text-amber-600">上传全部证件可提升至 €30,000</p>
          )}
          {data.allDocumentsUploaded && (
            <p className="mt-1 text-xs text-emerald-600">✓ 所有证件已上传，已获得最高额度</p>
          )}
        </div>
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm font-medium ${msg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {msg.text}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={onFileSelected}
      />

      {/* Document cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {data.docTypes.map((dt) => {
          const doc = getExistingDoc(dt.type);
          const isUploading = uploading === dt.type;
          const st = STATUS_MAP[doc?.status || "PENDING"];

          return (
            <div
              key={dt.type}
              className={`rounded-xl border p-5 transition-all ${
                doc ? "border-emerald-200 bg-white" : "border-dashed border-slate-300 bg-slate-50"
              }`}
            >
              {/* Icon */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    doc ? "bg-emerald-100 text-emerald-600" : "bg-slate-200 text-slate-400"
                  }`}>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">{dt.label}</h3>
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${st.color}`}>
                      {st.label}
                    </span>
                  </div>
                </div>
              </div>

              {/* Preview */}
              {doc?.documentUrl && doc.documentUrl.startsWith("data:image") && (
                <div className="mb-3 overflow-hidden rounded-lg border bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={doc.documentUrl}
                    alt={dt.label}
                    className="h-32 w-full object-cover"
                  />
                </div>
              )}

              {doc?.documentUrl && doc.documentUrl.startsWith("data:application/pdf") && (
                <div className="mb-3 flex h-32 items-center justify-center rounded-lg border bg-slate-50 text-slate-400">
                  <div className="text-center">
                    <svg className="mx-auto h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <p className="mt-1 text-xs">PDF 文件</p>
                  </div>
                </div>
              )}

              {doc && (
                <p className="mb-3 text-xs text-slate-400">
                  上传于 {new Date(doc.createdAt).toLocaleString("zh-CN")}
                </p>
              )}

              {/* Upload / Scan buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => triggerFileSelect(dt.type)}
                  disabled={isUploading}
                  className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    doc
                      ? "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      : "bg-cyan-600 text-white hover:bg-cyan-700"
                  } disabled:opacity-50`}
                >
                  {isUploading ? "上传中..." : doc ? "重新上传" : "上传证件"}
                </button>
                <button
                  onClick={() => setScanType(dt.type)}
                  disabled={isUploading}
                  className="rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-2.5 text-sm font-medium text-cyan-700 hover:bg-cyan-100 disabled:opacity-50"
                  title="使用摄像头扫描"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tips */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h3 className="text-sm font-semibold text-amber-800">上传须知</h3>
        <ul className="mt-2 space-y-1 text-xs text-amber-700">
          <li>• 支持 JPG、PNG、WebP、PDF 格式，单个文件不超过 5MB</li>
          <li>• 可点击 📷 图标使用摄像头扫描证件</li>
          <li>• 请确保证件照片清晰完整，信息可辨认</li>
          <li>• 上传全部三种证件后，额度将自动提升至 €30,000</li>
          <li>• 管理人员可能会根据实际情况调整您的额度</li>
        </ul>
      </div>

      {/* Document Scanner Modal */}
      {scanType && (
        <DocumentScanner
          onCapture={(file) => {
            setScanType(null);
            handleUpload(scanType, file);
          }}
          onClose={() => setScanType(null)}
        />
      )}
    </div>
  );
}
