"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import RealtimeTimer from "@/components/RealtimeTimer";
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
  recommendedRisk: null | {
    customerId: string;
    behaviorScore: number;
    repeatBorrowScore: number;
    overdueProbability: number;
    recommendedRiskScore: number;
    recommendedRiskLevel: string;
    reasons: string[];
  };
  totalApprovedAmount: number | null;
  rejectedReason: string | null;
  customer: { id: string; name: string; phone: string; idNumber: string };
  product: { id: string; name: string };
  approvals: Array<{
    id: string;
    action: string;
    comment: string | null;
    approvedAmount: number | null;
    createdAt: string;
    approver: { username: string; realName: string };
  }>;
  disbursement: null | { id: string; disbursementNo: string; status: string; amount: number; netAmount: number };
  mainContract: null | {
    id: string;
    contractNo: string;
    status: string;
    createdAt: string;
    signedAt: string | null;
    contractGenerationOptions: Record<string, unknown> | null;
  };
};

type ContractPreview = {
  contractNo: string;
  content: string;
  variableData: string;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function LoanApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingContract, setGeneratingContract] = useState(false);
  const [previewingContract, setPreviewingContract] = useState(false);
  const [preview, setPreview] = useState<ContractPreview | null>(null);

  const [form, setForm] = useState({
    amount: "",
    termValue: "",
    termUnit: "MONTH",
    purpose: "",
    remark: "",
  });

  const [contractForm, setContractForm] = useState({
    basePrincipal: "",
    capitalizedInterestAmount: "0",
    contractPrincipal: "",
    contractDisplayInterestRate: "2%",
    weeklyInterestAmount: "",
    monthlyInterestAmount: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/loan-applications/${params.id}`);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "加载失败");

      setData(json);
      setForm({
        amount: String(json.amount ?? ""),
        termValue: String(json.termValue ?? ""),
        termUnit: json.termUnit ?? "MONTH",
        purpose: json.purpose ?? "",
        remark: json.remark ?? "",
      });

      const saved = json.mainContract?.contractGenerationOptions ?? null;
      const defaultBase = Number(saved?.basePrincipal ?? json.amount ?? 0);
      const defaultCapitalized = Number(saved?.capitalizedInterestAmount ?? 0);
      const defaultPrincipal = Number(saved?.contractPrincipal ?? defaultBase + defaultCapitalized);

      setContractForm({
        basePrincipal: String(defaultBase || ""),
        capitalizedInterestAmount: String(defaultCapitalized || 0),
        contractPrincipal: String(defaultPrincipal || ""),
        contractDisplayInterestRate: String(saved?.contractDisplayInterestRate ?? "2%"),
        weeklyInterestAmount: String(saved?.weeklyInterestAmount ?? ""),
        monthlyInterestAmount: String(saved?.monthlyInterestAmount ?? ""),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const editable = useMemo(
    () => (data ? ["DRAFT", "REJECTED"].includes(data.status) : false),
    [data]
  );

  const parsedBasePrincipal = Number(contractForm.basePrincipal || 0);
  const parsedCapitalizedInterestAmount = Number(contractForm.capitalizedInterestAmount || 0);
  const parsedContractPrincipal = Number(contractForm.contractPrincipal || 0);
  const expectedContractPrincipal = parsedBasePrincipal + parsedCapitalizedInterestAmount;
  const contractPrincipalMismatch =
    contractForm.contractPrincipal.trim() !== "" &&
    Math.abs(parsedContractPrincipal - expectedContractPrincipal) > 0.0001;
  const contractFieldsInvalid =
    !Number.isFinite(parsedBasePrincipal) ||
    parsedBasePrincipal <= 0 ||
    !Number.isFinite(parsedCapitalizedInterestAmount) ||
    parsedCapitalizedInterestAmount < 0 ||
    !Number.isFinite(parsedContractPrincipal) ||
    parsedContractPrincipal <= 0 ||
    contractForm.contractDisplayInterestRate.trim().length === 0;

  async function save() {
    setSaving(true);
    try {
      const response = await fetch(`/api/loan-applications/${params.id}`, {
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
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "保存失败");
      await load();
      alert("保存成功");
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function postAction(url: string, payload?: Record<string, unknown>) {
    setSaving(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "操作失败");
      await load();
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSaving(false);
    }
  }

  function calculateContractPrincipal() {
    const base = Number(contractForm.basePrincipal || 0);
    const capitalized = Number(contractForm.capitalizedInterestAmount || 0);
    setContractForm((current) => ({
      ...current,
      contractPrincipal: String(base + capitalized),
    }));
  }

  function buildContractPayload() {
    return {
      applicationId: params.id,
      basePrincipal: Number(contractForm.basePrincipal),
      capitalizedInterestAmount: Number(contractForm.capitalizedInterestAmount || 0),
      contractPrincipal: Number(contractForm.contractPrincipal),
      contractDisplayInterestRate: contractForm.contractDisplayInterestRate,
      weeklyInterestAmount: contractForm.weeklyInterestAmount || undefined,
      monthlyInterestAmount: contractForm.monthlyInterestAmount || undefined,
    };
  }

  async function previewContract() {
    setPreviewingContract(true);
    try {
      const response = await fetch("/api/contracts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildContractPayload()),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "预览合同失败");
      setPreview(json.preview);
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "预览合同失败");
    } finally {
      setPreviewingContract(false);
    }
  }

  async function generateContract() {
    setGeneratingContract(true);
    try {
      const response = await fetch("/api/contracts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildContractPayload()),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "生成合同失败");
      setPreview(null);
      await load();
      alert("主合同已生成");
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "生成合同失败");
    } finally {
      setGeneratingContract(false);
    }
  }

  if (loading) return <div className="p-4">加载中...</div>;
  if (error || !data) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error || "数据不存在"}</div>;
  }

  const canGenerateContract = data.status === "APPROVED" && !data.mainContract;
  const canSubmitContractActions = canGenerateContract && !contractFieldsInvalid;

  return (
    <div className="space-y-6">
      <header className="panel-soft flex flex-wrap items-start justify-between gap-3 rounded-2xl px-5 py-4">
        <div>
          <div className="text-sm text-slate-500">借款申请详情</div>
          <h1 className="text-2xl font-bold text-slate-900">{data.applicationNo}</h1>
          <div className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs ${getStatusBadgeClass(data.status)}`}>
            {getStatusLabel(data.status)}
          </div>
        </div>
        <Link href="/admin/loan-applications" className="text-sm text-blue-600 hover:underline">
          返回列表
        </Link>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="panel-soft rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-slate-900">申请信息</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="space-y-1">
              <span className="text-slate-500">金额</span>
              <input
                disabled={!editable || saving}
                value={form.amount}
                onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                className="input-base"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-500">期限值</span>
              <input
                disabled={!editable || saving}
                value={form.termValue}
                onChange={(event) => setForm((current) => ({ ...current, termValue: event.target.value }))}
                className="input-base"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-500">期限单位</span>
              <input
                disabled={!editable || saving}
                value={form.termUnit}
                onChange={(event) => setForm((current) => ({ ...current, termUnit: event.target.value }))}
                className="input-base"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-500">用途</span>
              <input
                disabled={!editable || saving}
                value={form.purpose}
                onChange={(event) => setForm((current) => ({ ...current, purpose: event.target.value }))}
                className="input-base"
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-sm text-slate-500">备注</span>
            <textarea
              disabled={!editable || saving}
              value={form.remark}
              onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))}
              className="input-base min-h-24"
            />
          </label>
          {editable ? (
            <button disabled={saving} onClick={() => void save()} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
              保存编辑
            </button>
          ) : null}
        </div>

        <div className="panel-soft rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-slate-900">客户与产品</h2>
          <p className="text-sm text-slate-700">客户：{data.customer.name}（{data.customer.phone}）</p>
          <p className="text-sm text-slate-700">证件号：{data.customer.idNumber}</p>
          <p className="text-sm text-slate-700">产品：{data.product.name}</p>
          {data.riskScore != null ? <p className="text-sm text-slate-700">风控分：{data.riskScore}</p> : null}
          {data.recommendedRisk ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <div className="font-semibold text-slate-900">
                智能建议：{data.recommendedRisk.recommendedRiskLevel} / {data.recommendedRisk.recommendedRiskScore}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                行为分 {data.recommendedRisk.behaviorScore} · 复借分 {data.recommendedRisk.repeatBorrowScore} ·
                逾期概率 {data.recommendedRisk.overdueProbability}%
              </div>
              <div className="mt-2 text-xs text-slate-600">
                {data.recommendedRisk.reasons.join(" / ") || "暂无额外风险说明"}
              </div>
            </div>
          ) : null}
          {data.rejectedReason ? <p className="text-sm text-red-700">拒绝原因：{data.rejectedReason}</p> : null}
          {data.totalApprovedAmount != null ? (
            <p className="text-sm text-emerald-700">审批金额：{formatMoney(data.totalApprovedAmount)}</p>
          ) : null}
        </div>
      </section>

      <section className="panel-soft rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-slate-900">审批动作</h2>
        <div className="flex flex-wrap gap-2">
          {(data.status === "DRAFT" || data.status === "REJECTED") && (
            <button
              disabled={saving}
              onClick={() => void postAction(`/api/loan-applications/${params.id}/submit`)}
              className="btn-soft px-3 py-1.5 text-sm"
            >
              提交风控
            </button>
          )}
          {data.status === "PENDING_RISK" && (
            <>
              <button
                disabled={saving}
                onClick={() =>
                  void postAction(`/api/loan-applications/${params.id}/risk`, {
                    action: "PASS",
                    comment: "详情页通过",
                  })
                }
                className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50"
              >
                风控通过
              </button>
              <button
                disabled={saving}
                onClick={() =>
                  void postAction(`/api/loan-applications/${params.id}/risk`, {
                    action: "REJECT",
                    comment: "详情页拒绝",
                  })
                }
                className="btn-danger px-3 py-1.5 text-sm disabled:opacity-50"
              >
                风控拒绝
              </button>
            </>
          )}
          {data.status === "PENDING_APPROVAL" && (
            <>
              <button
                disabled={saving}
                onClick={() =>
                  void postAction(`/api/loan-applications/${params.id}/approve`, {
                    action: "APPROVE",
                  })
                }
                className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50"
              >
                审批通过
              </button>
              <button
                disabled={saving}
                onClick={() =>
                  void postAction(`/api/loan-applications/${params.id}/approve`, {
                    action: "REJECT",
                    comment: "审批拒绝",
                  })
                }
                className="btn-danger px-3 py-1.5 text-sm disabled:opacity-50"
              >
                审批拒绝
              </button>
            </>
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="panel-soft rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">主合同生成参数</h2>
              <p className="mt-1 text-sm text-slate-500">
                按单设置基础本金、并入本金的正常利息、合同本金和合同展示利率。
              </p>
            </div>
            <button
              type="button"
              onClick={calculateContractPrincipal}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              自动计算合同本金
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-slate-500">基础本金</span>
              <input
                value={contractForm.basePrincipal}
                onChange={(event) =>
                  setContractForm((current) => ({ ...current, basePrincipal: event.target.value }))
                }
                className="input-base"
                disabled={!!data.mainContract}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-500">并入本金的正常利息</span>
              <input
                value={contractForm.capitalizedInterestAmount}
                onChange={(event) =>
                  setContractForm((current) => ({
                    ...current,
                    capitalizedInterestAmount: event.target.value,
                  }))
                }
                className="input-base"
                disabled={!!data.mainContract}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-500">合同本金</span>
              <input
                value={contractForm.contractPrincipal}
                onChange={(event) =>
                  setContractForm((current) => ({ ...current, contractPrincipal: event.target.value }))
                }
                className="input-base"
                disabled={!!data.mainContract}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-500">合同展示利率</span>
              <input
                value={contractForm.contractDisplayInterestRate}
                onChange={(event) =>
                  setContractForm((current) => ({
                    ...current,
                    contractDisplayInterestRate: event.target.value,
                  }))
                }
                className="input-base"
                disabled={!!data.mainContract}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-500">每周正常利息展示</span>
              <input
                value={contractForm.weeklyInterestAmount}
                onChange={(event) =>
                  setContractForm((current) => ({ ...current, weeklyInterestAmount: event.target.value }))
                }
                className="input-base"
                placeholder="选填，如 500.00"
                disabled={!!data.mainContract}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-500">每月累计正常利息展示</span>
              <input
                value={contractForm.monthlyInterestAmount}
                onChange={(event) =>
                  setContractForm((current) => ({ ...current, monthlyInterestAmount: event.target.value }))
                }
                className="input-base"
                placeholder="选填，如 2000.00"
                disabled={!!data.mainContract}
              />
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            当前口径预览：基础本金 {contractForm.basePrincipal || "0"} + 并入本金利息{" "}
            {contractForm.capitalizedInterestAmount || "0"} = 合同本金 {contractForm.contractPrincipal || "0"}。
            合同中另列展示利率 {contractForm.contractDisplayInterestRate || "2%"}，该利率不参与系统正常利息重复计算。
          </div>

          {contractFieldsInvalid ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              请先填写有效的合同参数：基础本金和合同本金必须大于 0，并入本金的正常利息不能小于 0，合同展示利率不能为空。
            </div>
          ) : null}

          {contractPrincipalMismatch ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              当前“合同本金”与“基础本金 + 并入本金的正常利息”不一致。系统允许手动调整，但生成前建议再次核对。
            </div>
          ) : null}

          {!data.mainContract ? (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!canSubmitContractActions || previewingContract}
                onClick={() => void previewContract()}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {previewingContract ? "预览中..." : "预览合同"}
              </button>
              <button
                type="button"
                disabled={!canSubmitContractActions || generatingContract}
                onClick={() => void generateContract()}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {generatingContract ? "生成中..." : "直接生成主合同"}
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              当前申请已生成主合同，不允许重复生成。
            </div>
          )}
        </div>

        <div className="panel-soft rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-slate-900">主合同状态</h2>
          {!data.mainContract ? (
            <p className="text-sm text-slate-500">当前还没有主合同。</p>
          ) : (
            <>
              <div className="text-sm text-slate-700">合同号：{data.mainContract.contractNo}</div>
              <div className="text-sm text-slate-700">状态：{getStatusLabel(data.mainContract.status)}</div>
              <div className="text-sm text-slate-700">
                创建时间：{new Date(data.mainContract.createdAt).toLocaleString("zh-CN")}
              </div>
              <div className="text-sm text-slate-700">
                签署时间：
                {data.mainContract.signedAt
                  ? new Date(data.mainContract.signedAt).toLocaleString("zh-CN")
                  : "未签署"}
              </div>
              {data.mainContract.contractGenerationOptions ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <div>基础本金：{String(data.mainContract.contractGenerationOptions.basePrincipal ?? "-")}</div>
                  <div>并入本金利息：{String(data.mainContract.contractGenerationOptions.capitalizedInterestAmount ?? "-")}</div>
                  <div>合同本金：{String(data.mainContract.contractGenerationOptions.contractPrincipal ?? "-")}</div>
                  <div>展示利率：{String(data.mainContract.contractGenerationOptions.contractDisplayInterestRate ?? "-")}</div>
                </div>
              ) : null}
              <Link
                href={`/client/sign/contract/${data.mainContract.id}`}
                target="_blank"
                className="inline-flex w-fit rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                查看合同签署页
              </Link>
            </>
          )}
        </div>
      </section>

      {preview ? (
        <section className="panel-soft rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">合同预览</h2>
              <p className="mt-1 text-sm text-slate-500">合同号：{preview.contractNo}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                关闭预览
              </button>
              <button
                type="button"
                disabled={generatingContract}
                onClick={() => void generateContract()}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {generatingContract ? "生成中..." : "确认并生成"}
              </button>
            </div>
          </div>
          <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white p-4">
            <div
              dangerouslySetInnerHTML={{ __html: preview.content }}
              className="prose prose-sm max-w-none"
            />
          </div>
        </section>
      ) : null}

      <section className="table-shell rounded-xl p-4">
        <h2 className="mb-3 font-semibold text-slate-900">审批历史</h2>

        {["DISBURSED", "OVERDUE"].includes(data.status) ? (
          <section className="mb-6">
            <RealtimeTimer applicationId={params.id} />
          </section>
        ) : null}

        {data.approvals.length === 0 ? (
          <p className="text-sm text-slate-500">暂无审批记录</p>
        ) : (
          <ul className="space-y-2">
            {data.approvals.map((item) => (
              <li key={item.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
                <div className="font-medium text-slate-800">{item.action}</div>
                <div className="text-slate-600">
                  {item.approver.realName || item.approver.username} |{" "}
                  {new Date(item.createdAt).toLocaleString("zh-CN")}
                </div>
                {item.comment ? <div className="mt-1 text-slate-700">备注：{item.comment}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
