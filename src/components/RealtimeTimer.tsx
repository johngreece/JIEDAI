"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface Tier {
  maxDays: number;
  maxHours?: number;
  ratePercent: number;
  label: string;
}

interface RealtimeData {
  applicationId: string;
  applicationNo: string;
  customer: { name: string; phone: string };
  productName: string;
  channel: string;
  principal: number;
  netDisbursement: number;
  startTime: string;
  dueDate: string;
  currentTime: string;
  remainingToDueMs: number;
  elapsedMs: number;
  elapsedDays: number;
  elapsedFormatted: string;
  currentTier: Tier | null;
  tierIndex: number;
  tiers: Tier[];
  repaymentAmount: number;
  feeAmount: number;
  isOverdue: boolean;
  overdueDays: number;
  overduePenalty: number;
  todayInterest: number;
  totalRepayment: number;
  liveTotalRepayment: number;
  interestPaused: boolean;
  frozenPayableAmount: number | null;
  frozenAt: string | null;
  frozenRepaymentNo: string | null;
  frozenRepaymentStatus: string | null;
}

function money(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatElapsedClient(ms: number): string {
  if (ms < 0) return "0秒";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (mins > 0) parts.push(`${mins}分`);
  parts.push(`${secs}秒`);
  return parts.join("");
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function calcRepayment(principal: number, ratePercent: number, channel: string): number {
  const rate = ratePercent / 100;
  if (channel === "UPFRONT_DEDUCTION") {
    return Math.round(principal * 100) / 100;
  }
  return Math.round(principal * (1 + rate) * 100) / 100;
}

function getTierHours(tier: Tier): number {
  return tier.maxHours ?? tier.maxDays * 24;
}

function findTierIndex(elapsedMs: number, tiers: Tier[]): number {
  for (let i = 0; i < tiers.length; i += 1) {
    if (elapsedMs <= getTierHours(tiers[i]) * 60 * 60 * 1000) return i;
  }
  return tiers.length > 0 ? tiers.length - 1 : -1;
}

export default function RealtimeTimer({ applicationId }: { applicationId: string }) {
  const [data, setData] = useState<RealtimeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localElapsedMs, setLocalElapsedMs] = useState(0);
  const [serverFetchTime, setServerFetchTime] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/loan-applications/${applicationId}/realtime`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? "获取数据失败");
        return;
      }

      const json = (await res.json()) as RealtimeData;
      setData(json);
      setLocalElapsedMs(json.elapsedMs);
      setServerFetchTime(Date.now());
      setError(null);
    } catch {
      setError("网络请求失败");
    }
  }, [applicationId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    if (!data) return;
    const timer = setInterval(() => {
      const drift = Date.now() - serverFetchTime;
      setLocalElapsedMs(data.elapsedMs + drift);
    }, 1000);
    return () => clearInterval(timer);
  }, [data, serverFetchTime]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="animate-pulse rounded-lg border bg-white p-6">
        <div className="mb-4 h-6 w-1/3 rounded bg-gray-200" />
        <div className="h-10 w-1/2 rounded bg-gray-200" />
      </div>
    );
  }

  const sortedTiers = [...data.tiers].sort((a, b) => getTierHours(a) - getTierHours(b));
  const tierIdx = findTierIndex(localElapsedMs, sortedTiers);
  const serverNow = new Date(data.currentTime).getTime();
  const localNow = serverNow + (Date.now() - serverFetchTime);
  const remainingToDueMs = new Date(data.dueDate).getTime() - localNow;
  const dueSoon = remainingToDueMs > 0 && remainingToDueMs <= 24 * 60 * 60 * 1000;
  const isOverdue = remainingToDueMs <= 0 || data.isOverdue;
  const isPaused = data.interestPaused;

  let currentRepayment = data.repaymentAmount;
  let currentTierLabel = isOverdue ? "已逾期" : "计息中";

  if (!isOverdue && tierIdx >= 0) {
    const tier = sortedTiers[tierIdx];
    currentRepayment = calcRepayment(data.principal, tier.ratePercent, data.channel);
    currentTierLabel = tier.label;
  }

  if (isOverdue) {
    currentRepayment = data.liveTotalRepayment ?? data.totalRepayment;
  }

  if (isPaused) {
    currentRepayment = data.frozenPayableAmount ?? data.totalRepayment;
    currentTierLabel = "计息已暂停";
  }

  const headerClass = isPaused
    ? "bg-emerald-600 text-white"
    : isOverdue
      ? "bg-red-600 text-white"
      : dueSoon
        ? "bg-amber-500 text-white"
        : "bg-blue-600 text-white";

  const countdownText =
    remainingToDueMs >= 0
      ? `距离到期 ${formatElapsedClient(remainingToDueMs)}`
      : `已逾期 ${formatElapsedClient(Math.abs(remainingToDueMs))}`;

  return (
    <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
      <div className={`px-4 py-4 sm:px-6 ${headerClass}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold">
              {isPaused ? "还款处理中，计息已暂停" : isOverdue ? "借款已逾期" : "还款计时中"}
            </h3>
            <p className="text-sm opacity-90">
              {data.productName} · {data.customer.name}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <div className="font-mono text-2xl font-bold tabular-nums sm:text-3xl">
              {formatElapsedClient(localElapsedMs)}
            </div>
            <div className="text-sm opacity-80">放款后已过</div>
          </div>
        </div>
      </div>

      <div className="border-b px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-1 text-sm text-gray-500">
              {isPaused ? "已锁定应还金额" : "当前应还金额"}
            </div>
            <div className="text-3xl font-bold text-gray-900 tabular-nums sm:text-4xl">
              {money(currentRepayment)}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  isPaused
                    ? "bg-emerald-100 text-emerald-800"
                    : isOverdue
                      ? "bg-red-100 text-red-800"
                      : dueSoon
                        ? "bg-amber-100 text-amber-800"
                        : "bg-green-100 text-green-800"
                }`}
              >
                {currentTierLabel}
                {!isPaused && !isOverdue && tierIdx >= 0 && ` (${sortedTiers[tierIdx].ratePercent}%)`}
              </span>
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                {countdownText}
              </span>
            </div>
          </div>

          <Link
            href="/client/repayments?focus=current"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800 hover:no-underline"
          >
            {isPaused ? "查看还款处理" : "立即还款"}
          </Link>
        </div>

        {isPaused ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            还款单 {data.frozenRepaymentNo} 已提交，系统从{" "}
            {data.frozenAt ? formatDateTime(data.frozenAt) : "提交时刻"} 起临时暂停新增利息；已生成利息不变。若后台点未收款，暂停期间也会补算，金额继续实时更新。
          </div>
        ) : dueSoon && !isOverdue ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            当前借款即将到期，请提前安排还款；点击还款并提交后，系统会按提交时刻临时暂停新增利息。
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 px-4 py-4 text-sm sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <InfoBlock label="借款本金" value={money(data.principal)} />
        <InfoBlock label="实际到手" value={money(data.netDisbursement)} />
        <InfoBlock label="放款时间" value={formatDateTime(data.startTime)} />
        <InfoBlock label="到期时间" value={formatDateTime(data.dueDate)} />
      </div>

      <div className="border-t px-4 py-4 sm:px-6">
        <h4 className="mb-3 text-sm font-medium text-gray-700">阶梯费率</h4>
        <div className="space-y-2">
          {sortedTiers.map((tier, i) => {
            const isActive = !isPaused && !isOverdue && i === tierIdx;
            const isPast = !isPaused && !isOverdue && i < tierIdx;
            const repay = calcRepayment(data.principal, tier.ratePercent, data.channel);
            return (
              <div
                key={`${tier.maxDays}-${tier.maxHours ?? "na"}-${tier.ratePercent}`}
                className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm ${
                  isActive
                    ? "border border-blue-200 bg-blue-50 font-medium"
                    : isPast
                      ? "bg-gray-50 text-gray-400 line-through"
                      : "bg-gray-50"
                }`}
              >
                <span>
                  {isActive && "▸ "}
                  {tier.label} ({tier.ratePercent}%)
                </span>
                <span className="shrink-0 tabular-nums">{money(repay)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {isOverdue && !isPaused ? (
        <div className="border-t bg-red-50 px-4 py-4 sm:px-6">
          <h4 className="mb-2 text-sm font-medium text-red-700">逾期详情</h4>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <InfoBlock label="逾期天数" value={`${data.overdueDays} 天`} tone="red" />
            <InfoBlock label="今日预估费用" value={money(data.todayInterest)} tone="red" />
            <InfoBlock label="累计逾期费用" value={money(data.overduePenalty)} tone="red" />
            <InfoBlock label="实时总应还" value={money(data.liveTotalRepayment)} tone="red" />
          </div>
          <p className="mt-2 text-xs text-red-500">
            逾期后按系统规则滚动计费；客户提交还款后会临时暂停新增利息，若后台标记未收款则恢复并补算暂停期间。
          </p>
        </div>
      ) : null}
    </div>
  );
}

function InfoBlock({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "red";
}) {
  const labelClass = tone === "red" ? "text-red-500" : "text-gray-500";
  const valueClass = tone === "red" ? "text-red-700" : "text-gray-900";

  return (
    <div>
      <span className={labelClass}>{label}</span>
      <p className={`font-medium ${valueClass}`}>{value}</p>
    </div>
  );
}
