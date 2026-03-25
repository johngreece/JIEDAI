"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ProviderHealth = {
  channel: string;
  provider: string;
  fallbackToWebhook: boolean;
  status: string;
  recentSuccess: number;
  recentFailed: number;
  queueSize: number;
  successRate: number | null;
  avgDurationMs: number | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
};

type DeliveryAttempt = {
  id: string;
  provider: string;
  attemptNo: number;
  status: string;
  errorMessage: string | null;
  createdAt: string;
};

type DeliveryItem = {
  id: string;
  channel: string;
  provider: string;
  status: string;
  audience: string;
  targetName: string;
  targetId: string;
  title: string;
  templateCode: string | null;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  lastError: string | null;
  createdAt: string;
  attempts: DeliveryAttempt[];
};

type HealthResponse = {
  summary: {
    pending: number;
    failed: number;
    dead: number;
    deliveredToday: number;
  };
  providers: ProviderHealth[];
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN");
}

function statusTone(status: string) {
  if (status === "UP" || status === "SENT") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "DEGRADED" || status === "FAILED" || status === "PENDING") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  if (status === "DOWN" || status === "DEAD") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

export function MessageDeliveriesPageClient() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [items, setItems] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [provider, setProvider] = useState("");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ page: "1", pageSize: "50" });
      if (status) params.set("status", status);
      if (channel) params.set("channel", channel);
      if (provider) params.set("provider", provider);
      if (query.trim()) params.set("q", query.trim());

      const [healthRes, listRes] = await Promise.all([
        fetch("/api/admin/message-deliveries/health"),
        fetch(`/api/admin/message-deliveries?${params}`),
      ]);

      const healthData = await healthRes.json();
      const listData = await listRes.json();

      if (!healthRes.ok) throw new Error(healthData.error ?? "加载监控失败");
      if (!listRes.ok) throw new Error(listData.error ?? "加载投递日志失败");

      setHealth(healthData);
      setItems(listData.items ?? []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [status, channel, provider, query]);

  useEffect(() => {
    void load();
  }, [load]);

  async function retryDelivery(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/admin/message-deliveries/${id}/retry`, { method: "POST" });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function retryQueue() {
    setBusyId("retry_due");
    try {
      await fetch("/api/admin/message-deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_due", limit: 30 }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">告警投递中心</h1>
            <p className="mt-1 text-sm text-slate-600">
              查看真实发送结果、失败队列和供应商状态，并支持人工重试与明细钻取。
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              刷新
            </button>
            <button
              type="button"
              onClick={() => void retryQueue()}
              disabled={busyId === "retry_due"}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              处理失败队列
            </button>
          </div>
        </div>

        {health ? (
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Pending</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{health.summary.pending}</div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-amber-500">Failed</div>
              <div className="mt-2 text-2xl font-semibold text-amber-700">{health.summary.failed}</div>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-rose-500">Dead</div>
              <div className="mt-2 text-2xl font-semibold text-rose-700">{health.summary.dead}</div>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-emerald-500">24h Sent</div>
              <div className="mt-2 text-2xl font-semibold text-emerald-700">
                {health.summary.deliveredToday}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {health ? (
        <div className="grid gap-4 xl:grid-cols-3">
          {health.providers.map((item) => (
            <div
              key={`${item.channel}-${item.provider}`}
              className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-400">{item.channel}</div>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">{item.provider}</h2>
                </div>
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(item.status)}`}
                >
                  {item.status}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-slate-400">成功率</div>
                  <div className="mt-1 font-semibold text-slate-900">
                    {item.successRate === null ? "-" : `${item.successRate}%`}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-slate-400">平均耗时</div>
                  <div className="mt-1 font-semibold text-slate-900">
                    {item.avgDurationMs === null ? "-" : `${item.avgDurationMs} ms`}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-slate-400">成功/失败</div>
                  <div className="mt-1 font-semibold text-slate-900">
                    {item.recentSuccess}/{item.recentFailed}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-slate-400">队列积压</div>
                  <div className="mt-1 font-semibold text-slate-900">{item.queueSize}</div>
                </div>
              </div>
              <div className="mt-4 space-y-1 text-xs text-slate-500">
                <div>最近尝试：{formatDate(item.lastAttemptAt)}</div>
                <div>最近成功：{formatDate(item.lastSuccessAt)}</div>
                <div>最近失败：{formatDate(item.lastFailureAt)}</div>
                <div>Webhook 回退：{item.fallbackToWebhook ? "已启用" : "未配置"}</div>
                <div className="truncate">失败原因：{item.lastFailureReason || "-"}</div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、模板码、接收人"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:w-72"
          />
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            搜索
          </button>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">全部状态</option>
            <option value="PENDING">PENDING</option>
            <option value="FAILED">FAILED</option>
            <option value="DEAD">DEAD</option>
            <option value="SENT">SENT</option>
          </select>
          <select
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">全部通道</option>
            <option value="EMAIL">EMAIL</option>
            <option value="SMS">SMS</option>
            <option value="WHATSAPP">WHATSAPP</option>
          </select>
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">全部供应商</option>
            <option value="RESEND">RESEND</option>
            <option value="TWILIO">TWILIO</option>
            <option value="META">META</option>
            <option value="WEBHOOK">WEBHOOK</option>
          </select>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                <th className="px-4 py-3">通道</th>
                <th className="px-4 py-3">接收对象</th>
                <th className="px-4 py-3">标题</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">尝试</th>
                <th className="px-4 py-3">时间</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    正在加载投递记录...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    当前没有投递记录。
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="align-top hover:bg-slate-50/60">
                    <td className="px-4 py-4">
                      <div className="font-medium text-slate-900">{item.channel}</div>
                      <div className="text-xs text-slate-500">{item.provider}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-slate-900">{item.targetName}</div>
                      <div className="text-xs text-slate-500">{item.audience} · {item.targetId}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-slate-900">{item.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.templateCode || "-"}</div>
                      <div className="mt-2 text-xs text-rose-600">{item.lastError || ""}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(item.status)}`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-600">
                      <div>{item.attemptCount}/{item.maxAttempts}</div>
                      <div className="mt-2 space-y-1">
                        {item.attempts.map((attempt) => (
                          <div key={attempt.id}>
                            #{attempt.attemptNo} {attempt.provider} {attempt.status}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-500">
                      <div>创建：{formatDate(item.createdAt)}</div>
                      <div>最近尝试：{formatDate(item.lastAttemptAt)}</div>
                      <div>下次重试：{formatDate(item.nextRetryAt)}</div>
                      <div>送达：{formatDate(item.deliveredAt)}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-2">
                        <Link
                          href={`/admin/message-deliveries/${item.id}`}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-center text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          查看明细
                        </Link>
                        <button
                          type="button"
                          onClick={() => void retryDelivery(item.id)}
                          disabled={busyId === item.id || item.status === "SENT"}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                        >
                          立即重试
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
