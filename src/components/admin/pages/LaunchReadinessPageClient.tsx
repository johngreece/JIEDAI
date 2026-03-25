"use client";

import { useEffect, useState } from "react";

type ReadinessData = {
  testClient: {
    id: string;
    name: string;
    phone: string;
  };
  activeApplication: null | {
    id: string;
    applicationNo: string;
    status: string;
    createdAt: string;
    nextScheduleItem: null | {
      id: string;
      dueDate: string;
      status: string;
      totalDue: number;
      remaining: number;
    };
  };
  notifications: Array<{
    id: string;
    type: string;
    templateCode: string | null;
    title: string;
    content: string;
    createdAt: string;
    isRead: boolean;
    actionUrl: string;
    actionLabel: string;
  }>;
  smartSummary: {
    healthScore: number;
    collectionStages: Array<{
      code: string;
      label: string;
      count: number;
      amount: number;
    }>;
    anomalyCount: number;
    riskSignals: Array<{
      customerId: string;
      name: string;
      recommendedRiskScore: number;
      recommendedRiskLevel: string;
      overdueProbability: number;
      reasons: string[];
    }>;
    funderForecasts: Array<{
      funderId: string;
      funderName: string;
      interest7d: number;
      interest30d: number;
      collection7d: number;
      collection30d: number;
    }>;
    realNetProfit30d: number;
  };
};

type ScenarioResult = {
  ok: boolean;
  stages: Array<{
    stage: string;
    created: number;
  }>;
  notifications: Array<{
    id: string;
    type: string;
    templateCode: string | null;
    title: string;
    createdAt: string;
  }>;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export function LaunchReadinessPageClient() {
  const [data, setData] = useState<ReadinessData | null>(null);
  const [scenario, setScenario] = useState<ScenarioResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/launch-readiness", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "加载巡检数据失败");
      setData(json);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载巡检数据失败");
    } finally {
      setLoading(false);
    }
  }

  async function runScenario() {
    setRunning(true);
    try {
      const response = await fetch("/api/admin/launch-readiness/notification-scenarios", {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "执行通知场景失败");
      setScenario(json);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "执行通知场景失败");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading && !data) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="stat-tile rounded-2xl p-5">
            <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
            <div className="mt-4 h-8 w-32 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="panel-soft rounded-2xl px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm text-slate-500">上线巡检</div>
            <h1 className="text-2xl font-bold text-slate-900">智能链路验收台</h1>
            <p className="mt-1 text-sm text-slate-600">
              一页看通知、风险、异常、资金预测是否都打通，并可一键生成通知测试场景。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              刷新巡检
            </button>
            <button
              type="button"
              onClick={() => void runScenario()}
              disabled={running}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {running ? "正在生成场景..." : "一键生成通知场景"}
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {data ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ReadinessCard title="业务健康度" value={`${data.smartSummary.healthScore}`} note="来自智能仪表盘" />
            <ReadinessCard title="异常总数" value={`${data.smartSummary.anomalyCount}`} note="同设备/频改资料/异常提现" />
            <ReadinessCard title="30天净利润" value={formatMoney(data.smartSummary.realNetProfit30d)} note="已计入资金方收益预测" />
            <ReadinessCard
              title="测试客户"
              value={data.testClient.phone}
              note={`${data.testClient.name} · ${data.activeApplication?.applicationNo || "无在途借款"}`}
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-6">
              <div className="stat-tile rounded-2xl p-5">
                <h2 className="text-lg font-semibold text-slate-900">通知场景准备状态</h2>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <div>当前测试客户：{data.testClient.name} / {data.testClient.phone}</div>
                  <div>在途借款：{data.activeApplication?.applicationNo || "无"}</div>
                  <div>借款状态：{data.activeApplication?.status || "-"}</div>
                  <div>下一期状态：{data.activeApplication?.nextScheduleItem?.status || "-"}</div>
                  <div>下一期到期：{formatDate(data.activeApplication?.nextScheduleItem?.dueDate || null)}</div>
                  <div>下一期待还：{formatMoney(data.activeApplication?.nextScheduleItem?.remaining || 0)}</div>
                </div>
              </div>

              <div className="stat-tile rounded-2xl p-5">
                <h2 className="text-lg font-semibold text-slate-900">催收分层覆盖</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {data.smartSummary.collectionStages.map((item) => (
                    <div key={item.code} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-sm text-slate-500">{item.label}</div>
                      <div className="mt-2 text-xl font-semibold text-slate-900">{item.count} 笔</div>
                      <div className="mt-1 text-xs text-slate-500">{formatMoney(item.amount)}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="stat-tile rounded-2xl p-5">
                <h2 className="text-lg font-semibold text-slate-900">最新客户端通知样本</h2>
                <div className="mt-4 space-y-3">
                  {data.notifications.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                      当前测试客户暂无通知。点击“一键生成通知场景”即可自动生成到期/逾期提醒。
                    </div>
                  ) : (
                    data.notifications.map((item) => (
                      <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-slate-900">{item.title}</div>
                          <div className="text-xs text-slate-500">{formatDate(item.createdAt)}</div>
                        </div>
                        <div className="mt-2 text-sm text-slate-600">{item.content}</div>
                        <div className="mt-2 text-xs text-slate-500">
                          {item.type} · {item.actionLabel} · {item.actionUrl}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="stat-tile rounded-2xl p-5">
                <h2 className="text-lg font-semibold text-slate-900">风险信号样本</h2>
                <div className="mt-4 space-y-3">
                  {data.smartSummary.riskSignals.map((item) => (
                    <div key={item.customerId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-slate-900">{item.name}</div>
                        <div className="text-sm font-semibold text-slate-900">{item.recommendedRiskScore}</div>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {item.recommendedRiskLevel} · 逾期概率 {item.overdueProbability}%
                      </div>
                      <div className="mt-2 text-sm text-slate-600">{item.reasons.join(" / ")}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="stat-tile rounded-2xl p-5">
                <h2 className="text-lg font-semibold text-slate-900">资金方收益预测样本</h2>
                <div className="mt-4 space-y-3">
                  {data.smartSummary.funderForecasts.map((item) => (
                    <div key={item.funderId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="font-medium text-slate-900">{item.funderName}</div>
                      <div className="mt-2 text-sm text-slate-600">
                        7天收益 {formatMoney(item.interest7d)} · 30天收益 {formatMoney(item.interest30d)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        7天回款 {formatMoney(item.collection7d)} · 30天回款 {formatMoney(item.collection30d)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="stat-tile rounded-2xl p-5">
                <h2 className="text-lg font-semibold text-slate-900">最近一次场景执行</h2>
                <div className="mt-4 space-y-3">
                  {!scenario ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                      还没有执行通知场景。
                    </div>
                  ) : (
                    <>
                      {scenario.stages.map((item) => (
                        <div key={item.stage} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                          {item.stage}：生成 {item.created} 条通知
                        </div>
                      ))}
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-sm font-medium text-slate-900">通知模板结果</div>
                        <div className="mt-2 space-y-2 text-xs text-slate-500">
                          {scenario.notifications.map((item) => (
                            <div key={item.id}>
                              {item.type} · {item.templateCode || "-"} · {formatDate(item.createdAt)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function ReadinessCard({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <div className="stat-tile rounded-2xl p-5">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{value}</div>
      <div className="mt-2 text-sm text-slate-500">{note}</div>
    </div>
  );
}
