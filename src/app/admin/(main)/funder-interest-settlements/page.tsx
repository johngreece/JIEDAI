"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { makeClientIdempotencyKey } from "@/lib/client-idempotency";

type Settlement = {
  id: string;
  settlementNo: string;
  funderName: string;
  accountName: string;
  bankName: string;
  disbursementNo: string;
  applicationNo: string;
  customerName: string;
  ruleMode: string;
  cycleIndex: number;
  cycleStart: string;
  cycleEnd: string;
  dueDate: string;
  principal: number;
  rate: number;
  interestAmount: number;
  status: string;
  paidAt: string | null;
  confirmedAt: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
  remark: string | null;
};

type ApiPayload = {
  items: Settlement[];
  summary: {
    dueAmount: number;
    paidPendingConfirmAmount: number;
    confirmedAmount: number;
    rejectedAmount: number;
  };
  filters?: {
    startDate: string | null;
    endDate: string | null;
    periodLabel: string;
  };
};

const statusLabel: Record<string, string> = {
  DUE: "待平台打款",
  PAID_BY_PLATFORM: "平台已打款",
  CONFIRMED_BY_FUNDER: "资金方已确认",
  FUNDER_REJECTED: "资金方反馈未收到",
  CANCELLED: "已取消",
};

const statusBadge: Record<string, string> = {
  DUE: "border-amber-200 bg-amber-50 text-amber-700",
  PAID_BY_PLATFORM: "border-blue-200 bg-blue-50 text-blue-700",
  CONFIRMED_BY_FUNDER: "border-emerald-200 bg-emerald-50 text-emerald-700",
  FUNDER_REJECTED: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-slate-200 bg-slate-50 text-slate-600",
};

const modeLabel: Record<string, string> = {
  FIXED_MONTHLY: "固定月息",
  VOLUME_BASED: "固定周息",
  PROFIT_SHARE: "按实际收益分润",
};

const statusFilters = [
  { value: "all", label: "全部" },
  { value: "DUE", label: "待平台打款" },
  { value: "PAID_BY_PLATFORM", label: "已打款待确认" },
  { value: "CONFIRMED_BY_FUNDER", label: "资金方已确认" },
  { value: "FUNDER_REJECTED", label: "反馈未收到" },
] as const;

function isKnownStatusFilter(value: string | null) {
  return statusFilters.some((item) => item.value === value);
}

function money(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function dateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function AdminFunderInterestSettlementsPage() {
  const [data, setData] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");
  const [paymentDraft, setPaymentDraft] = useState<{ settlement: Settlement; remark: string } | null>(null);
  const actionKeyRef = useRef<{ scope: string; key: string } | null>(null);

  const load = useCallback(async (nextStatus = statusFilter ?? "all") => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (nextStatus !== "all") params.set("status", nextStatus);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const query = params.toString();
      const response = await fetch(`/api/funder-interest-settlements${query ? `?${query}` : ""}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "资金方收益结算加载失败");
      }
      setData(payload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "资金方收益结算加载失败");
    } finally {
      setLoading(false);
    }
  }, [endDate, startDate, statusFilter]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialStatus = params.get("status");
    setStatusFilter(isKnownStatusFilter(initialStatus) ? initialStatus : "all");
    setStartDate(params.get("startDate") ?? params.get("start") ?? "");
    setEndDate(params.get("endDate") ?? params.get("end") ?? "");
  }, []);

  useEffect(() => {
    if (statusFilter) void load(statusFilter);
  }, [load, statusFilter]);

  function selectStatus(nextStatus: string) {
    setStatusFilter(nextStatus);
    actionKeyRef.current = null;
    const url = new URL(window.location.href);
    if (nextStatus === "all") {
      url.searchParams.delete("status");
    } else {
      url.searchParams.set("status", nextStatus);
    }
    window.history.replaceState(null, "", url.toString());
  }

  function setDueRange(range: "month" | "30d" | "all") {
    actionKeyRef.current = null;
    if (range === "all") {
      setStartDate("");
      setEndDate("");
      return;
    }

    const today = new Date();
    const start = range === "month"
      ? new Date(today.getFullYear(), today.getMonth(), 1)
      : new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
    setStartDate(dateInput(start));
    setEndDate(dateInput(today));
  }

  function downloadCsv() {
    const params = new URLSearchParams();
    const currentStatus = statusFilter ?? "all";
    if (currentStatus !== "all") params.set("status", currentStatus);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    params.set("format", "csv");
    window.open(`/api/funder-interest-settlements?${params}`, "_blank");
  }

  function getActionKey(scope: string) {
    if (actionKeyRef.current?.scope !== scope) {
      actionKeyRef.current = { scope, key: makeClientIdempotencyKey(`admin-${scope}`) };
    }
    return actionKeyRef.current.key;
  }

  async function postAction(body: Record<string, unknown>, scope: string) {
    if (processing) return false;
    setProcessing(true);
    try {
      const response = await fetch("/api/funder-interest-settlements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": getActionKey(scope),
        },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        actionKeyRef.current = null;
        alert(result.error || "操作失败");
        return false;
      }
      actionKeyRef.current = null;
      await load();
      return true;
    } finally {
      setProcessing(false);
    }
  }

  function openMarkPaid(item: Settlement) {
    actionKeyRef.current = null;
    setPaymentDraft({ settlement: item, remark: item.remark?.trim() ?? "" });
  }

  async function submitPaymentDraft() {
    if (!paymentDraft) return;
    const remark = paymentDraft.remark.trim();
    if (!remark) {
      alert("请填写平台打款流水号或付款备注");
      return;
    }

    const ok = await postAction(
      { action: "mark_paid", settlementId: paymentDraft.settlement.id, remark },
      `funder-interest-paid-${paymentDraft.settlement.id}`,
    );
    if (ok) setPaymentDraft(null);
  }

  const items = data?.items ?? [];
  const summary = data?.summary;
  const dueItems = items.filter((item) => item.status === "DUE" || item.status === "FUNDER_REJECTED");
  const periodLabel = data?.filters?.periodLabel ?? (
    startDate && endDate
      ? `${startDate} 至 ${endDate}`
      : startDate
        ? `${startDate} 起`
        : endDate
          ? `截至 ${endDate}`
          : "全部到期时间"
  );

  return (
    <div className="space-y-6">
      <header className="panel-soft admin-page-header">
        <div className="admin-page-header__meta">
          <span className="admin-page-header__eyebrow">Funder Yield</span>
          <h1 className="admin-page-header__title">资金方收益结算</h1>
          <p className="admin-page-header__description">
            按资金方周息/月息规则生成应付利息，平台打款后等待资金方确认到账。
          </p>
        </div>
        <div className="admin-toolbar-group">
          <button
            type="button"
            onClick={() => postAction({ action: "generate_due" }, "funder-interest-generate")}
            disabled={processing}
            className="admin-btn admin-btn-primary"
          >
            生成到期结算单
          </button>
          <button type="button" onClick={() => void load()} className="admin-btn admin-btn-secondary">
            刷新
          </button>
          <button type="button" onClick={downloadCsv} disabled={loading} className="admin-btn admin-btn-secondary">
            导出 CSV
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      <section className="panel-soft rounded-2xl p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">到期时间筛选</div>
            <p className="mt-1 text-xs text-slate-500">
              按结算单到期时间筛选，待打款、待确认、已确认和未收到金额会同步重算。
            </p>
          </div>
          <div className="admin-toolbar-group">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
              起
              <input
                type="date"
                className="admin-field w-40 text-sm"
                value={startDate}
                onChange={(event) => {
                  actionKeyRef.current = null;
                  setStartDate(event.target.value);
                }}
              />
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
              止
              <input
                type="date"
                className="admin-field w-40 text-sm"
                value={endDate}
                onChange={(event) => {
                  actionKeyRef.current = null;
                  setEndDate(event.target.value);
                }}
              />
            </label>
            <button type="button" onClick={() => setDueRange("month")} className="admin-btn admin-btn-ghost admin-btn-sm">
              本月
            </button>
            <button type="button" onClick={() => setDueRange("30d")} className="admin-btn admin-btn-ghost admin-btn-sm">
              近30天
            </button>
            <button type="button" onClick={() => setDueRange("all")} className="admin-btn admin-btn-ghost admin-btn-sm">
              全部
            </button>
          </div>
        </div>
        <div className="mt-3 text-xs font-medium text-slate-500">当前口径：{periodLabel}</div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="待打款" value={money(summary?.dueAmount ?? 0)} tone="amber" />
        <Metric label="已打款待确认" value={money(summary?.paidPendingConfirmAmount ?? 0)} tone="blue" />
        <Metric label="资金方已确认" value={money(summary?.confirmedAmount ?? 0)} tone="emerald" />
        <Metric label="反馈未收到" value={money(summary?.rejectedAmount ?? 0)} tone="red" />
      </section>

      <section className="flex flex-wrap gap-2">
        {statusFilters.map((item) => {
          const active = (statusFilter ?? "all") === item.value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => selectStatus(item.value)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </section>

      {loading ? <div className="py-8 text-center text-slate-400">加载中...</div> : null}

      {dueItems.length > 0 ? (
        <section className="space-y-3">
          <div className="admin-section-card__title text-amber-700">需要处理 ({dueItems.length})</div>
          {dueItems.map((item) => (
            <div key={item.id} className="admin-section-card border-amber-200 bg-amber-50/50">
              <div className="admin-section-card__body">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="font-medium text-slate-900">
                      {item.funderName} · {money(item.interestAmount)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {modeLabel[item.ruleMode] ?? item.ruleMode} · 第 {item.cycleIndex} 期 · 到期 {dateTime(item.dueDate)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {item.customerName} / {item.disbursementNo} · 本金 {money(item.principal)} · 利率 {item.rate}%
                    </div>
                    {item.remark ? <div className="mt-2 text-xs text-slate-600">打款备注：{item.remark}</div> : null}
                    {item.rejectReason ? <div className="mt-2 text-xs text-red-600">资金方反馈：{item.rejectReason}</div> : null}
                  </div>
                  <button
                    type="button"
                    className="admin-btn admin-btn-success admin-btn-sm"
                    disabled={processing}
                    onClick={() => openMarkPaid(item)}
                  >
                    登记打款信息
                  </button>
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {paymentDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-slate-900">登记平台打款</div>
                <p className="mt-1 text-sm text-slate-500">
                  {paymentDraft.settlement.funderName} · {money(paymentDraft.settlement.interestAmount)}
                </p>
              </div>
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadge[paymentDraft.settlement.status] ?? "border-slate-200 bg-slate-50 text-slate-600"}`}>
                {statusLabel[paymentDraft.settlement.status] ?? paymentDraft.settlement.status}
              </span>
            </div>
            <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
              {paymentDraft.settlement.customerName} / {paymentDraft.settlement.disbursementNo} · 到期 {dateTime(paymentDraft.settlement.dueDate)}
            </div>
            <label className="mt-4 block">
              <span className="text-sm font-medium text-slate-700">打款流水号或付款备注</span>
              <textarea
                className="admin-field mt-2 min-h-[104px] text-sm"
                placeholder="例如：SEPA 付款流水号、银行回执号、付款批次号"
                value={paymentDraft.remark}
                onChange={(event) => {
                  actionKeyRef.current = null;
                  setPaymentDraft((current) =>
                    current ? { ...current, remark: event.target.value } : current,
                  );
                }}
                autoFocus
              />
            </label>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                disabled={processing}
                onClick={() => {
                  actionKeyRef.current = null;
                  setPaymentDraft(null);
                }}
              >
                取消
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-success"
                disabled={processing || !paymentDraft.remark.trim()}
                onClick={() => void submitPaymentDraft()}
              >
                确认已打款
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="table-shell admin-table-shell">
        <div className="admin-table-toolbar">
          <div>
            <div className="admin-table-title">收益结算单</div>
            <p className="admin-table-note">每一行都是一笔资金方应收利息，状态会跟随平台打款和资金方确认更新。</p>
          </div>
          <div className="text-right text-xs font-medium text-slate-500">{periodLabel}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3">结算单</th>
                <th className="px-4 py-3">资金方</th>
                <th className="px-4 py-3">客户/放款</th>
                <th className="px-4 py-3">周期</th>
                <th className="px-4 py-3">规则</th>
                <th className="px-4 py-3">利息</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">平台打款</th>
                <th className="px-4 py-3">打款备注</th>
                <th className="px-4 py-3">资金方确认</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                    暂无收益结算单，可先点击“生成到期结算单”。
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-mono text-xs">{item.settlementNo}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{item.funderName}</div>
                      <div className="text-xs text-slate-500">{item.accountName}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{item.customerName}</div>
                      <div className="text-xs text-slate-500">{item.disbursementNo}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {dateTime(item.cycleStart)} 至 {dateTime(item.cycleEnd)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {modeLabel[item.ruleMode] ?? item.ruleMode} · {item.rate}%
                    </td>
                    <td className="px-4 py-3 font-semibold text-amber-600">{money(item.interestAmount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadge[item.status] ?? "border-slate-200 bg-slate-50 text-slate-600"}`}>
                        {statusLabel[item.status] ?? item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{dateTime(item.paidAt)}</td>
                    <td className="max-w-xs px-4 py-3 text-xs text-slate-500">
                      <span className="break-words" title={item.remark ?? undefined}>{item.remark || "-"}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{dateTime(item.confirmedAt)}</td>
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

function Metric({ label, value, tone }: { label: string; value: string; tone: "amber" | "blue" | "emerald" | "red" }) {
  const color =
    tone === "amber"
      ? "text-amber-600"
      : tone === "blue"
        ? "text-blue-600"
        : tone === "emerald"
          ? "text-emerald-600"
          : "text-red-600";

  return (
    <div className="stat-tile rounded-2xl p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-3 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
