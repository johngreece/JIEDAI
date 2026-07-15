"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RestructureDecisionAction } from "@/lib/restructure-lifecycle";
import { formatMoney as money } from "@/lib/system-config";

type Restructure = {
  id: string;
  applicationId: string;
  remainingPrincipal: number;
  remainingInterest: number;
  remainingFee: number;
  remainingPenalty: number;
  projectedInterest: number;
  newTermValue: number;
  newTermUnit: string;
  newRate: number;
  applyReason: string | null;
  status: string;
  remark: string | null;
  approvedAt: string | null;
  createdAt: string;
};

type RestructureCandidate = {
  applicationId: string;
  applicationNo: string;
  applicationStatus: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  planId: string;
  planNo: string;
  planVersion: number;
  remainingPrincipal: number;
  remainingInterest: number;
  remainingFee: number;
  remainingPenalty: number;
};

type CreateDraft = {
  applicationId: string;
  newTermValue: string;
  newTermUnit: "MONTH" | "DAY";
  annualRatePercent: string;
  applyReason: string;
};

const EMPTY_DRAFT: CreateDraft = {
  applicationId: "",
  newTermValue: "6",
  newTermUnit: "MONTH",
  annualRatePercent: "12",
  applyReason: "",
};

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "待审批", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  APPROVED: { label: "已批准", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  REJECTED: { label: "已拒绝", cls: "bg-red-50 text-red-700 border-red-200" },
};

function apiMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const response = payload as {
    message?: unknown;
    details?: { reason?: unknown };
  };
  if (typeof response.details?.reason === "string") return response.details.reason;
  return typeof response.message === "string" ? response.message : fallback;
}

export default function RestructuresPage() {
  const [items, setItems] = useState<Restructure[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [candidates, setCandidates] = useState<RestructureCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState<CreateDraft>(EMPTY_DRAFT);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (status) params.set("status", status);
      const res = await fetch(`/api/restructures?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(apiMessage(data, "加载重组记录失败"));
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (error) {
      alert(error instanceof Error ? error.message : "加载重组记录失败");
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedCandidate = useMemo(
    () => candidates.find((item) => item.applicationId === draft.applicationId) ?? null,
    [candidates, draft.applicationId],
  );

  const projectedInterest = useMemo(() => {
    if (!selectedCandidate) return 0;
    const term = Number(draft.newTermValue);
    const annualRate = Number(draft.annualRatePercent) / 100;
    if (!Number.isFinite(term) || !Number.isFinite(annualRate)) return 0;
    const termFactor = draft.newTermUnit === "MONTH" ? term / 12 : term / 365;
    return selectedCandidate.remainingPrincipal * annualRate * termFactor;
  }, [draft.annualRatePercent, draft.newTermUnit, draft.newTermValue, selectedCandidate]);

  async function openCreate() {
    setShowCreate(true);
    setLoadingCandidates(true);
    setDraft(EMPTY_DRAFT);
    try {
      const res = await fetch("/api/restructures?view=candidates");
      const data = await res.json();
      if (!res.ok) throw new Error(apiMessage(data, "加载可重组借款失败"));
      const nextCandidates = (data.items ?? []) as RestructureCandidate[];
      setCandidates(nextCandidates);
      setDraft((current) => ({
        ...current,
        applicationId: nextCandidates[0]?.applicationId ?? "",
      }));
    } catch (error) {
      setCandidates([]);
      alert(error instanceof Error ? error.message : "加载可重组借款失败");
    } finally {
      setLoadingCandidates(false);
    }
  }

  async function submitCreate() {
    const newTermValue = Number(draft.newTermValue);
    const annualRatePercent = Number(draft.annualRatePercent);
    if (!draft.applicationId) return alert("请选择需要重组的借款");
    if (!Number.isInteger(newTermValue) || newTermValue < 1 || newTermValue > 360) {
      return alert("新期限必须是 1 至 360 的整数");
    }
    if (!Number.isFinite(annualRatePercent) || annualRatePercent < 0 || annualRatePercent > 100) {
      return alert("年化利率必须在 0% 至 100% 之间");
    }
    if (draft.applyReason.trim().length < 3) return alert("请填写至少 3 个字的重组原因");

    setSubmitting(true);
    try {
      const res = await fetch("/api/restructures", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          applicationId: draft.applicationId,
          newTermValue,
          newTermUnit: draft.newTermUnit,
          newRate: annualRatePercent / 100,
          applyReason: draft.applyReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(apiMessage(data, "创建重组申请失败"));
      setShowCreate(false);
      setDraft(EMPTY_DRAFT);
      setPage(1);
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "创建重组申请失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function approve(id: string, action: RestructureDecisionAction) {
    let remark = "";
    if (action === "APPROVE") {
      const confirmed = window.confirm(
        "批准后将立即作废原计划，按新年化利率生成新计划。旧未付利息和罚息将被替代，旧未付服务费将结转。确认继续？",
      );
      if (!confirmed) return;
    } else {
      const reason = window.prompt("请填写拒绝原因（可留空）");
      if (reason === null) return;
      remark = reason.trim();
    }

    setActing(id);
    try {
      const res = await fetch(`/api/restructures/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, remark }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(apiMessage(data, "操作失败"));
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "操作失败");
    } finally {
      setActing(null);
    }
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <header className="panel-soft admin-page-header">
        <div className="admin-page-header__meta">
          <span className="admin-page-header__eyebrow">Restructures</span>
          <h1 className="admin-page-header__title">贷款重组</h1>
          <p className="admin-page-header__description">基于实时分项余额重新定价，审批前会校验原计划版本和在途还款。</p>
        </div>
        <div className="admin-toolbar-group">
          <select
            className="admin-field w-40 text-sm"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            aria-label="重组状态"
          >
            <option value="">全部状态</option>
            <option value="PENDING">待审批</option>
            <option value="APPROVED">已批准</option>
            <option value="REJECTED">已拒绝</option>
          </select>
          <button type="button" onClick={() => void load()} className="admin-btn admin-btn-secondary">刷新</button>
          <button type="button" onClick={() => void openCreate()} className="admin-btn admin-btn-primary">新建重组</button>
        </div>
      </header>

      <section className="table-shell admin-table-shell">
        <div className="admin-table-toolbar">
          <div>
            <div className="admin-table-title">重组申请列表</div>
            <p className="admin-table-note">余额在申请时固化，审批时再次核对；任何还款或计划变化都会阻止旧申请生效。</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3">申请</th>
                <th className="px-4 py-3">剩余本金</th>
                <th className="px-4 py-3">旧利息</th>
                <th className="px-4 py-3">新利息</th>
                <th className="px-4 py-3">费用 / 罚息</th>
                <th className="px-4 py-3">期限 / 年化</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">申请时间</th>
                <th className="px-4 py-3">操作 / 备注</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">加载中...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">暂无重组记录</td></tr>
              ) : (
                items.map((item) => {
                  const statusMeta = STATUS_MAP[item.status] ?? {
                    label: item.status,
                    cls: "bg-slate-50 text-slate-600 border-slate-200",
                  };
                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs text-slate-700">{item.applicationId.slice(0, 8)}</div>
                        <div className="mt-1 max-w-44 truncate text-xs text-slate-400" title={item.applyReason ?? ""}>{item.applyReason ?? "-"}</div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{money(item.remainingPrincipal)}</td>
                      <td className="px-4 py-3 text-slate-500">{money(item.remainingInterest)}</td>
                      <td className="px-4 py-3 text-slate-800">{money(item.projectedInterest)}</td>
                      <td className="px-4 py-3 text-slate-500">
                        <div>{money(item.remainingFee)} 费用</div>
                        <div className="mt-1 text-xs">{money(item.remainingPenalty)} 罚息</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <div>{item.newTermValue} {item.newTermUnit === "MONTH" ? "个月" : "天"}</div>
                        <div className="mt-1 text-xs text-slate-500">{(Number(item.newRate) * 100).toFixed(2)}%</div>
                      </td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusMeta.cls}`}>{statusMeta.label}</span></td>
                      <td className="px-4 py-3 text-slate-500">{new Date(item.createdAt).toLocaleDateString("zh-CN")}</td>
                      <td className="px-4 py-3">
                        {item.status === "PENDING" ? (
                          <div className="admin-btn-group">
                            <button type="button" disabled={acting === item.id} onClick={() => void approve(item.id, "APPROVE")} className="text-sm text-emerald-600 hover:underline disabled:opacity-50">批准</button>
                            <button type="button" disabled={acting === item.id} onClick={() => void approve(item.id, "REJECT")} className="text-sm text-red-600 hover:underline disabled:opacity-50">拒绝</button>
                          </div>
                        ) : (
                          item.remark ?? "-"
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 ? (
          <div className="admin-pagination">
            <span className="admin-pagination__summary">共 {total} 条</span>
            <div className="admin-pagination__controls">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="admin-btn admin-btn-ghost admin-btn-sm">上一页</button>
              <span className="admin-pagination__status">{page}/{totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="admin-btn admin-btn-ghost admin-btn-sm">下一页</button>
            </div>
          </div>
        ) : null}
      </section>

      {showCreate ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="create-restructure-title">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="create-restructure-title" className="text-lg font-semibold text-slate-900">新建贷款重组</h2>
                <p className="mt-1 text-sm text-slate-500">系统只接受期限、年化利率和原因；所有余额均从生效计划实时读取。</p>
              </div>
              <button type="button" className="admin-btn admin-btn-ghost admin-btn-sm" disabled={submitting} onClick={() => setShowCreate(false)} aria-label="关闭">关闭</button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">借款</span>
                <select
                  className="admin-field mt-2 w-full text-sm"
                  value={draft.applicationId}
                  disabled={loadingCandidates || submitting}
                  onChange={(event) => setDraft((current) => ({ ...current, applicationId: event.target.value }))}
                >
                  {loadingCandidates ? <option value="">正在加载...</option> : null}
                  {!loadingCandidates && candidates.length === 0 ? <option value="">暂无可重组借款</option> : null}
                  {candidates.map((candidate) => (
                    <option key={candidate.applicationId} value={candidate.applicationId}>
                      {candidate.applicationNo} · {candidate.customerName} · {candidate.productName}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">新期限</span>
                  <input className="admin-field mt-2 w-full text-sm" type="number" min="1" max="360" step="1" value={draft.newTermValue} disabled={submitting} onChange={(event) => setDraft((current) => ({ ...current, newTermValue: event.target.value }))} />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">期限单位</span>
                  <select className="admin-field mt-2 w-full text-sm" value={draft.newTermUnit} disabled={submitting} onChange={(event) => setDraft((current) => ({ ...current, newTermUnit: event.target.value as "MONTH" | "DAY" }))}>
                    <option value="MONTH">个月</option>
                    <option value="DAY">天</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">新年化利率</span>
                  <div className="relative mt-2">
                    <input className="admin-field w-full pr-8 text-sm" type="number" min="0" max="100" step="0.01" value={draft.annualRatePercent} disabled={submitting} onChange={(event) => setDraft((current) => ({ ...current, annualRatePercent: event.target.value }))} />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
                  </div>
                </label>
              </div>

              {selectedCandidate ? (
                <div className="bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                    <div>剩余本金：<strong>{money(selectedCandidate.remainingPrincipal)}</strong></div>
                    <div>预计新利息：<strong>{money(projectedInterest)}</strong></div>
                    <div>将替代旧利息：{money(selectedCandidate.remainingInterest)}</div>
                    <div>将结转服务费：{money(selectedCandidate.remainingFee)}</div>
                    <div>将替代罚息：{money(selectedCandidate.remainingPenalty)}</div>
                    <div>原计划：{selectedCandidate.planNo} v{selectedCandidate.planVersion}</div>
                  </div>
                  <p className="mt-3 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500">批准后，旧未付利息与罚息不再进入新计划；系统按新年化利率重新计算利息，并将旧未付服务费结转到新计划。</p>
                </div>
              ) : null}

              <label className="block">
                <span className="text-sm font-medium text-slate-700">重组原因</span>
                <textarea className="admin-field mt-2 min-h-28 w-full resize-y text-sm" maxLength={500} value={draft.applyReason} disabled={submitting} placeholder="记录客户情况、内部判断和重组依据" onChange={(event) => setDraft((current) => ({ ...current, applyReason: event.target.value }))} />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" className="admin-btn admin-btn-secondary" disabled={submitting} onClick={() => setShowCreate(false)}>取消</button>
              <button type="button" className="admin-btn admin-btn-primary" disabled={submitting || loadingCandidates || !selectedCandidate} onClick={() => void submitCreate()}>{submitting ? "正在提交" : "提交审批"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
