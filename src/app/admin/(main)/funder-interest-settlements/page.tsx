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

export default function AdminFunderInterestSettlementsPage() {
  const [data, setData] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const actionKeyRef = useRef<{ scope: string; key: string } | null>(null);

  const load = useCallback(async (nextStatus = statusFilter ?? "all") => {
    setLoading(true);
    try {
      const query = nextStatus === "all" ? "" : `?status=${encodeURIComponent(nextStatus)}`;
      const response = await fetch(`/api/funder-interest-settlements${query}`);
      const payload = await response.json();
      setData(payload);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    const initialStatus = new URLSearchParams(window.location.search).get("status");
    setStatusFilter(isKnownStatusFilter(initialStatus) ? initialStatus : "all");
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

  function getActionKey(scope: string) {
    if (actionKeyRef.current?.scope !== scope) {
      actionKeyRef.current = { scope, key: makeClientIdempotencyKey(`admin-${scope}`) };
    }
    return actionKeyRef.current.key;
  }

  async function postAction(body: Record<string, unknown>, scope: string) {
    if (processing) return;
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
        return;
      }
      actionKeyRef.current = null;
      await load();
    } finally {
      setProcessing(false);
    }
  }

  const items = data?.items ?? [];
  const summary = data?.summary;
  const dueItems = items.filter((item) => item.status === "DUE" || item.status === "FUNDER_REJECTED");

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
        </div>
      </header>

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
                    {item.rejectReason ? <div className="mt-2 text-xs text-red-600">资金方反馈：{item.rejectReason}</div> : null}
                  </div>
                  <button
                    type="button"
                    className="admin-btn admin-btn-success admin-btn-sm"
                    disabled={processing}
                    onClick={() =>
                      postAction(
                        { action: "mark_paid", settlementId: item.id },
                        `funder-interest-paid-${item.id}`,
                      )
                    }
                  >
                    标记已打款
                  </button>
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="table-shell admin-table-shell">
        <div className="admin-table-toolbar">
          <div>
            <div className="admin-table-title">收益结算单</div>
            <p className="admin-table-note">每一行都是一笔资金方应收利息，状态会跟随平台打款和资金方确认更新。</p>
          </div>
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
                <th className="px-4 py-3">资金方确认</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
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
