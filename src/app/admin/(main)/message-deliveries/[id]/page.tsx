"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type AttemptDetail = {
  id: string;
  provider: string;
  attemptNo: number;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  request: unknown;
  response: unknown;
};

type DeliveryDetail = {
  id: string;
  sourceType: string | null;
  sourceId: string | null;
  audience: string;
  targetId: string;
  targetName: string;
  channel: string;
  provider: string;
  event: string;
  templateCode: string | null;
  title: string;
  content: string;
  recipientPhone: string | null;
  recipientEmail: string | null;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  lastError: string | null;
  providerMessageId: string | null;
  durationMs: number | null;
  createdAt: string;
  payload: unknown;
  metadata: unknown;
  response: unknown;
  attempts: AttemptDetail[];
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN");
}

function formatJson(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function statusTone(status: string) {
  if (status === "SENT") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "FAILED" || status === "PENDING") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "DEAD") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

export default function MessageDeliveryDetailPage() {
  const params = useParams<{ id: string }>();
  const [item, setItem] = useState<DeliveryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/admin/message-deliveries/${params.id}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "加载明细失败");

        setItem(data);
        setExpandedAttemptId(data.attempts?.[0]?.id ?? null);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "加载失败");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [params.id]);

  const activeAttempt = useMemo(
    () => item?.attempts.find((attempt) => attempt.id === expandedAttemptId) ?? null,
    [expandedAttemptId, item]
  );

  if (loading) {
    return <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">正在加载投递明细...</div>;
  }

  if (error || !item) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-sm text-rose-700 shadow-sm">
        {error || "投递明细不存在"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Link
              href="/admin/message-deliveries"
              className="text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              返回投递中心
            </Link>
            <h1 className="mt-3 text-2xl font-bold text-slate-900">投递明细</h1>
            <p className="mt-1 text-sm text-slate-600">
              查看本次投递的原始 payload、供应商响应，以及每次 attempt 的 request/response/error。
            </p>
          </div>
          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(item.status)}`}>
            {item.status}
          </span>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Channel</div>
            <div className="mt-2 font-semibold text-slate-900">{item.channel}</div>
            <div className="text-xs text-slate-500">{item.provider}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Target</div>
            <div className="mt-2 font-semibold text-slate-900">{item.targetName}</div>
            <div className="text-xs text-slate-500">{item.audience} · {item.targetId}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Attempts</div>
            <div className="mt-2 font-semibold text-slate-900">{item.attemptCount}/{item.maxAttempts}</div>
            <div className="text-xs text-slate-500">事件 {item.event}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Timing</div>
            <div className="mt-2 font-semibold text-slate-900">
              {item.durationMs === null ? "-" : `${item.durationMs} ms`}
            </div>
            <div className="text-xs text-slate-500">最近尝试 {formatDate(item.lastAttemptAt)}</div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="text-sm font-semibold text-slate-900">基础信息</div>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <div>标题：{item.title}</div>
              <div>模板码：{item.templateCode || "-"}</div>
              <div>来源：{item.sourceType || "-"} · {item.sourceId || "-"}</div>
              <div>接收手机：{item.recipientPhone || "-"}</div>
              <div>接收邮箱：{item.recipientEmail || "-"}</div>
              <div>供应商消息 ID：{item.providerMessageId || "-"}</div>
              <div>创建时间：{formatDate(item.createdAt)}</div>
              <div>送达时间：{formatDate(item.deliveredAt)}</div>
              <div>下次重试：{formatDate(item.nextRetryAt)}</div>
              <div className="whitespace-pre-line">最近错误：{item.lastError || "-"}</div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="text-sm font-semibold text-slate-900">消息正文</div>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
              {item.content}
            </pre>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Attempt 列表</h2>
          <div className="mt-4 space-y-3">
            {item.attempts.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">当前还没有 attempt 记录。</div>
            ) : (
              item.attempts.map((attempt) => (
                <button
                  key={attempt.id}
                  type="button"
                  onClick={() => setExpandedAttemptId(attempt.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    expandedAttemptId === attempt.id
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold">
                      #{attempt.attemptNo} {attempt.provider}
                    </div>
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                        expandedAttemptId === attempt.id
                          ? "border-white/20 bg-white/10 text-white"
                          : statusTone(attempt.status)
                      }`}
                    >
                      {attempt.status}
                    </span>
                  </div>
                  <div className={`mt-2 text-xs ${expandedAttemptId === attempt.id ? "text-slate-300" : "text-slate-500"}`}>
                    开始：{formatDate(attempt.startedAt)}
                  </div>
                  <div className={`text-xs ${expandedAttemptId === attempt.id ? "text-slate-300" : "text-slate-500"}`}>
                    耗时：{attempt.durationMs === null ? "-" : `${attempt.durationMs} ms`}
                  </div>
                  <div className={`mt-2 line-clamp-2 text-xs ${expandedAttemptId === attempt.id ? "text-rose-200" : "text-rose-600"}`}>
                    {attempt.errorMessage || "无错误"}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Delivery 原始 JSON</h2>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <div>
                <div className="mb-2 text-sm font-medium text-slate-700">payloadJson</div>
                <pre className="max-h-[420px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                  {formatJson(item.payload)}
                </pre>
              </div>
              <div>
                <div className="mb-2 text-sm font-medium text-slate-700">metadataJson / responseJson</div>
                <pre className="max-h-[420px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                  {formatJson({
                    metadata: item.metadata,
                    response: item.response,
                  })}
                </pre>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Attempt 明细</h2>
            {activeAttempt ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Attempt</div>
                    <div className="mt-2 font-semibold text-slate-900">#{activeAttempt.attemptNo}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Started</div>
                    <div className="mt-2 font-semibold text-slate-900">{formatDate(activeAttempt.startedAt)}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Finished</div>
                    <div className="mt-2 font-semibold text-slate-900">{formatDate(activeAttempt.finishedAt)}</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  {activeAttempt.errorMessage || "本次 attempt 没有错误信息。"}
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div>
                    <div className="mb-2 text-sm font-medium text-slate-700">requestJson</div>
                    <pre className="max-h-[420px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                      {formatJson(activeAttempt.request)}
                    </pre>
                  </div>
                  <div>
                    <div className="mb-2 text-sm font-medium text-slate-700">responseJson</div>
                    <pre className="max-h-[420px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                      {formatJson(activeAttempt.response)}
                    </pre>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                请选择一条 attempt 查看 request / response / error。
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
