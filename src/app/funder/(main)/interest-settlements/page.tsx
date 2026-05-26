"use client";

import { useEffect, useRef, useState } from "react";
import { makeClientIdempotencyKey } from "@/lib/client-idempotency";

type Settlement = {
  id: string;
  settlementNo: string;
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
};

type Payload = {
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
  PAID_BY_PLATFORM: "待我确认",
  CONFIRMED_BY_FUNDER: "已确认入账",
  FUNDER_REJECTED: "已反馈未收到",
  CANCELLED: "已取消",
};

const statusBadge: Record<string, string> = {
  DUE: "bg-amber-100 text-amber-700",
  PAID_BY_PLATFORM: "bg-blue-100 text-blue-700",
  CONFIRMED_BY_FUNDER: "bg-emerald-100 text-emerald-700",
  FUNDER_REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-600",
};

const modeLabel: Record<string, string> = {
  FIXED_MONTHLY: "固定月息",
  VOLUME_BASED: "固定周息",
  PROFIT_SHARE: "按实际收益分润",
};

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

export default function FunderInterestSettlementsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const actionKeyRef = useRef<{ scope: string; key: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/funder/interest-settlements");
      const payload = await response.json();
      setData(payload);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function getActionKey(scope: string) {
    if (actionKeyRef.current?.scope !== scope) {
      actionKeyRef.current = { scope, key: makeClientIdempotencyKey(`funder-${scope}`) };
    }
    return actionKeyRef.current.key;
  }

  async function submit(settlementId: string, action: "confirm_received" | "not_received") {
    setProcessingId(settlementId);
    try {
      const response = await fetch("/api/funder/interest-settlements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": getActionKey(`${settlementId}-${action}`),
        },
        body: JSON.stringify({
          settlementId,
          action,
          reason: action === "not_received" ? reason || "未收到该笔利息" : undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        actionKeyRef.current = null;
        alert(result.error || "操作失败");
        return;
      }
      actionKeyRef.current = null;
      setRejectingId(null);
      setReason("");
      await load();
    } finally {
      setProcessingId(null);
    }
  }

  const items = data?.items ?? [];
  const pendingConfirm = items.filter((item) => item.status === "PAID_BY_PLATFORM");

  return (
    <div className="space-y-6">
      <header className="panel-soft rounded-2xl px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">收益结算</h1>
            <p className="mt-1 text-sm text-slate-600">
              这里显示按周/月规则生成的利息结算单。平台标记已打款后，你需要确认是否收到。
            </p>
          </div>
          <button type="button" onClick={load} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            刷新
          </button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="待平台打款" value={money(data?.summary.dueAmount ?? 0)} />
        <Metric label="待我确认" value={money(data?.summary.paidPendingConfirmAmount ?? 0)} tone="blue" />
        <Metric label="已确认收益" value={money(data?.summary.confirmedAmount ?? 0)} tone="emerald" />
        <Metric label="未收到反馈" value={money(data?.summary.rejectedAmount ?? 0)} tone="red" />
      </section>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        </div>
      ) : null}

      {pendingConfirm.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">待确认到账</h2>
          {pendingConfirm.map((item) => (
            <div key={item.id} className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-lg font-semibold text-slate-900">{money(item.interestAmount)}</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {item.customerName} / {item.disbursementNo} · {modeLabel[item.ruleMode] ?? item.ruleMode} · 第 {item.cycleIndex} 期
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    周期 {dateTime(item.cycleStart)} 至 {dateTime(item.cycleEnd)} · 平台打款 {dateTime(item.paidAt)}
                  </div>
                </div>
                {rejectingId === item.id ? (
                  <div className="flex w-full flex-col gap-2 lg:w-80">
                    <input
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      placeholder="填写未收到原因"
                      value={reason}
                      onChange={(event) => {
                        actionKeyRef.current = null;
                        setReason(event.target.value);
                      }}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-60"
                        disabled={processingId === item.id}
                        onClick={() => submit(item.id, "not_received")}
                      >
                        提交未收到
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                        onClick={() => {
                          actionKeyRef.current = null;
                          setRejectingId(null);
                          setReason("");
                        }}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                      disabled={processingId === item.id}
                      onClick={() => submit(item.id, "confirm_received")}
                    >
                      确认已收到
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                      onClick={() => {
                        actionKeyRef.current = null;
                        setRejectingId(item.id);
                      }}
                    >
                      未收到
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="stat-tile rounded-2xl p-5">
        <h2 className="text-lg font-semibold text-slate-900">全部结算单</h2>
        {items.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            暂无收益结算单。
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left">结算单</th>
                  <th className="px-4 py-3 text-left">客户/放款</th>
                  <th className="px-4 py-3 text-left">到期日</th>
                  <th className="px-4 py-3 text-left">规则</th>
                  <th className="px-4 py-3 text-left">本金</th>
                  <th className="px-4 py-3 text-left">利息</th>
                  <th className="px-4 py-3 text-left">状态</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-mono text-xs">{item.settlementNo}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{item.customerName}</div>
                      <div className="text-xs text-slate-500">{item.disbursementNo}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{dateTime(item.dueDate)}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {modeLabel[item.ruleMode] ?? item.ruleMode} · {item.rate}%
                    </td>
                    <td className="px-4 py-3">{money(item.principal)}</td>
                    <td className="px-4 py-3 font-semibold text-amber-600">{money(item.interestAmount)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadge[item.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {statusLabel[item.status] ?? item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "blue" | "emerald" | "red";
}) {
  const color =
    tone === "blue"
      ? "text-blue-600"
      : tone === "emerald"
        ? "text-emerald-600"
        : tone === "red"
          ? "text-red-600"
          : "text-slate-900";

  return (
    <div className="stat-tile rounded-2xl p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-3 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
