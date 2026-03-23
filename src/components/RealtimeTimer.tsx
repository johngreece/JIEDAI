"use client";

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

export default function RealtimeTimer({
  applicationId,
}: {
  applicationId: string;
}) {
  const [data, setData] = useState<RealtimeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localElapsedMs, setLocalElapsedMs] = useState(0);
  const [serverFetchTime, setServerFetchTime] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/loan-applications/${applicationId}/realtime`);
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
    const interval = setInterval(fetchData, 30000);
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
  const isOverdue = data.isOverdue;

  let currentRepayment = data.repaymentAmount;
  let currentTierLabel = "已逾期";

  if (!isOverdue && tierIdx >= 0) {
    const tier = sortedTiers[tierIdx];
    currentRepayment = calcRepayment(data.principal, tier.ratePercent, data.channel);
    currentTierLabel = tier.label;
  }

  if (isOverdue) {
    currentRepayment = data.totalRepayment;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
      <div className={`px-6 py-4 ${isOverdue ? "bg-red-600 text-white" : "bg-blue-600 text-white"}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{isOverdue ? "借款已逾期" : "还款计时中"}</h3>
            <p className="text-sm opacity-90">
              {data.productName} · {data.customer.name}
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-mono font-bold tabular-nums">{formatElapsedClient(localElapsedMs)}</div>
            <div className="text-sm opacity-75">放款后已过 {formatElapsedClient(localElapsedMs)}</div>
          </div>
        </div>
      </div>

      <div className="border-b px-6 py-5">
        <div className="mb-1 text-sm text-gray-500">当前应还金额</div>
        <div className="text-4xl font-bold text-gray-900 tabular-nums">
          €
          {currentRepayment.toLocaleString("zh-CN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
        <div className="mt-1 text-sm">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              isOverdue ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
            }`}
          >
            {currentTierLabel}
            {!isOverdue && tierIdx >= 0 && ` (${sortedTiers[tierIdx].ratePercent}%)`}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 px-6 py-4 text-sm">
        <div>
          <span className="text-gray-500">借款本金</span>
          <p className="font-medium">€{data.principal.toLocaleString()}</p>
        </div>
        <div>
          <span className="text-gray-500">实际到手</span>
          <p className="font-medium">€{data.netDisbursement.toLocaleString()}</p>
        </div>
        <div>
          <span className="text-gray-500">借款模式</span>
          <p className="font-medium">{data.channel === "UPFRONT_DEDUCTION" ? "7天砍头息（固定5%）" : "7天全额到账（分档计费）"}</p>
        </div>
        <div>
          <span className="text-gray-500">放款时间</span>
          <p className="font-medium">{new Date(data.startTime).toLocaleString("zh-CN")}</p>
        </div>
      </div>

      <div className="border-t px-6 py-4">
        <h4 className="mb-3 text-sm font-medium text-gray-700">阶梯费率</h4>
        <div className="space-y-2">
          {sortedTiers.map((tier, i) => {
            const isActive = !isOverdue && i === tierIdx;
            const isPast = !isOverdue && i < tierIdx;
            const repay = calcRepayment(data.principal, tier.ratePercent, data.channel);
            return (
              <div
                key={`${tier.maxDays}-${tier.maxHours ?? "na"}-${tier.ratePercent}`}
                className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
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
                <span className="tabular-nums">
                  €
                  {repay.toLocaleString("zh-CN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {isOverdue && (
        <div className="border-t bg-red-50 px-6 py-4">
          <h4 className="mb-2 text-sm font-medium text-red-700">逾期详情</h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-red-500">逾期天数</span>
              <p className="font-medium text-red-700">{data.overdueDays} 天</p>
            </div>
            <div>
              <span className="text-red-500">今日预估费用</span>
              <p className="font-medium text-red-700">€{data.todayInterest.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-red-500">累计逾期费用</span>
              <p className="font-medium text-red-700">€{data.overduePenalty.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-red-500">总应还金额</span>
              <p className="font-medium text-red-700">€{data.totalRepayment.toLocaleString()}</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-red-500">
            逾期后按日复利滚动：第 1 到 7 天 1%/天，第 8 到 30 天 2%/天，第 31 天起 3%/天；未支付利息会并入本金继续计算。
          </p>
        </div>
      )}
    </div>
  );
}
