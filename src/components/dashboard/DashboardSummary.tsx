"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SummaryData = {
  todayDisbursement: string;
  todayRepayment: string;
  overdueAmount: string;
  activeLoanCount: number;
  overdueCount: number;
  funderBalance: string;
  totalProfit: string;
  profitRate: number;
  upcomingDue7d: string;
  pendingConfirmRepayment: number;
  pendingSignContract: number;
  pendingDisbursement: number;
};

type SmartTodo = {
  type: string;
  label: string;
  count: number;
  href: string;
  urgency: "critical" | "high" | "medium" | "low";
  description: string;
};

type SmartData = {
  alerts: {
    dueTodayTotal: number;
    due3DayTotal: number;
    due7DayTotal: number;
  };
  overdue: {
    mild: number;
    moderate: number;
    severe: number;
    total: number;
    totalAmount: number;
    totalPenalty: number;
    topCustomers: Array<{
      customerId: string;
      name: string;
      phone: string;
      riskLevel: string;
      totalAmount: number;
      totalPenalty: number;
      maxDays: number;
      count: number;
    }>;
  };
  customers: {
    total: number;
    topBorrowers: Array<{
      name: string;
      phone: string;
      totalBorrowed: number;
      activeLoans: number;
      valueTier: string;
      riskLevel: string;
    }>;
    riskCustomers: Array<{
      name: string;
      phone: string;
      overdueCount: number;
      totalBorrowed: number;
      riskLevel: string;
      hasExpiredKyc: boolean;
    }>;
    potentialReborrow: Array<{
      name: string;
      phone: string;
      settledLoans: number;
      totalBorrowed: number;
    }>;
  };
  pipeline: {
    applications: {
      total: number;
      olderThan3d: number;
      highRisk: number;
    };
    contracts: {
      total: number;
      olderThan2d: number;
    };
    disbursements: {
      total: number;
      olderThan1d: number;
      totalAmount: number;
    };
    repayments: {
      total: number;
      olderThan1d: number;
      totalAmount: number;
    };
    extensionsPending: number;
    restructuresPending: number;
  };
  compliance: {
    pendingKyc: number;
    expiredKyc: number;
    expiringSoonKyc: number;
  };
  cashflow: {
    fundBalance: number;
    expectedCollections7d: number;
    expectedCollections30d: number;
    pendingDisbursementAmount: number;
    predictedNetInflow7d: number;
    predictedNetInflow30d: number;
    fundingGap7d: number;
    fundingGap30d: number;
    coverageRatio: number;
    pressureLevel: string;
  };
  collectionAutomation: {
    stages: Array<{
      code: string;
      label: string;
      count: number;
      amount: number;
    }>;
    activeCases: number;
    externalTouchpointsEnabled: boolean;
  };
  financialForecast: {
    collections7d: number;
    collections30d: number;
    fundingGap7d: number;
    fundingGap30d: number;
    netInflow7d: number;
    netInflow30d: number;
    funderInterest7d: number;
    funderInterest30d: number;
    funderCollections7d: number;
    funderCollections30d: number;
    topFunderReturns: Array<{
      funderId: string;
      funderName: string;
      interest7d: number;
      interest30d: number;
      collection7d: number;
      collection30d: number;
    }>;
  };
  riskEngine: {
    averageRecommendedRiskScore: number;
    overdueProbabilityAverage: number;
    highRiskCustomers: number;
    blacklistCandidates: number;
    repeatBorrowCandidates: number;
    topSignals: Array<{
      customerId: string;
      name: string;
      phone: string;
      recommendedRiskScore: number;
      recommendedRiskLevel: string;
      overdueProbability: number;
      reasons: string[];
    }>;
  };
  anomalies: {
    total: number;
    critical: number;
    high: number;
    byType: {
      sharedDevice: number;
      profileChurn: number;
      applicationBurst: number;
      withdrawalSpike: number;
    };
    incidents: Array<{
      type: string;
      severity: "low" | "medium" | "high" | "critical";
      entityType: string;
      entityId: string;
      title: string;
      summary: string;
      detectedAt: string;
      metrics: Record<string, number | string>;
    }>;
  };
  operations: {
    marketingSpend7d: number;
    marketingSpend30d: number;
    newCustomers7d: number;
    newCustomers30d: number;
    cac7d: number;
    cac30d: number;
    approvalConversion30d: number;
    disbursementConversion30d: number;
    badDebtRate: number;
    realNetProfit30d: number;
    capitalTurnoverDays: number;
  };
  riskRadar: Array<{
    key: string;
    label: string;
    score: number;
    status: string;
    summary: string;
  }>;
  smartTodos: SmartTodo[];
  health: {
    score: number;
    onTimeRate: number;
    overdueRate: number;
    insights: string[];
  };
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "数据加载失败");
  }
  return response.json();
}

async function fetchDashboardData() {
  const [summary, smart] = await Promise.all([
    fetchJson<SummaryData>("/api/dashboard/summary"),
    fetchJson<SmartData>("/api/dashboard/smart"),
  ]);

  return { summary, smart };
}

function formatCurrency(value: number | string) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatNumber(value: number | string) {
  return new Intl.NumberFormat("zh-CN").format(Number(value || 0));
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

const urgencyTone: Record<SmartTodo["urgency"], string> = {
  critical: "border-red-200 bg-red-50 text-red-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-blue-200 bg-blue-50 text-blue-700",
};

const urgencyLabel: Record<SmartTodo["urgency"], string> = {
  critical: "立即处理",
  high: "优先处理",
  medium: "尽快跟进",
  low: "建议关注",
};

export function DashboardSummary() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [smart, setSmart] = useState<SmartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadData = async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const data = await fetchDashboardData();
      setSummary(data.summary);
      setSmart(data.smart);
      setError(null);
      setLastUpdated(new Date());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="stat-tile rounded-2xl p-5">
            <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
            <div className="mt-4 h-8 w-32 animate-pulse rounded bg-slate-100" />
            <div className="mt-3 h-3 w-20 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !summary || !smart) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
        <h3 className="text-lg font-semibold">智能看板加载失败</h3>
        <p className="mt-2 text-sm">{error || "暂时无法获取数据，请稍后重试。"}</p>
        <button
          type="button"
          onClick={() => void loadData()}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          重新加载
        </button>
      </div>
    );
  }

  const urgentCount = smart.smartTodos.filter(
    (item) => item.urgency === "critical" || item.urgency === "high"
  ).length;

  return (
    <div className="space-y-6">
      <section className="panel-soft rounded-2xl px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-slate-500">今日智能结论</p>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              当前业务健康度 {smart.health.score} 分
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              高优先任务 {urgentCount} 项，未来 7 天资金覆盖率 {smart.cashflow.coverageRatio.toFixed(2)}x。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {lastUpdated ? (
              <span className="text-sm text-slate-500">
                更新时间 {lastUpdated.toLocaleTimeString("zh-CN", { hour12: false })}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void loadData("refresh")}
              disabled={refreshing}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? "刷新中..." : "刷新数据"}
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="今日放款"
          value={formatCurrency(summary.todayDisbursement)}
          note={`待放款 ${formatNumber(summary.pendingDisbursement)} 笔`}
        />
        <MetricCard
          title="今日回款"
          value={formatCurrency(summary.todayRepayment)}
          note={`待确认还款 ${formatNumber(summary.pendingConfirmRepayment)} 笔`}
        />
        <MetricCard
          title="逾期敞口"
          value={formatCurrency(smart.overdue.totalAmount)}
          note={`严重逾期 ${formatNumber(smart.overdue.severe)} 笔`}
          tone="danger"
        />
        <MetricCard
          title="健康评分"
          value={`${smart.health.score}`}
          note={`准时率 ${formatPercent(smart.health.onTimeRate)}`}
          tone={smart.health.score >= 75 ? "success" : smart.health.score >= 55 ? "warn" : "danger"}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <div className="space-y-6">
          <div className="stat-tile rounded-2xl p-5">
            <SectionHeader
              title="智能行动清单"
              hint="按风险和收益优先级排序，适合直接分配给运营、风控和财务。"
            />
            <div className="mt-4 space-y-3">
              {smart.smartTodos.length === 0 ? (
                <EmptyState text="当前没有需要优先推进的智能待办。" />
              ) : (
                smart.smartTodos.slice(0, 6).map((item) => (
                  <Link
                    key={item.type}
                    href={item.href}
                    className={`block rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm hover:no-underline ${urgencyTone[item.urgency]}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-medium">{urgencyLabel[item.urgency]}</div>
                        <div className="mt-1 text-base font-semibold">{item.label}</div>
                        <p className="mt-2 text-sm opacity-90">{item.description}</p>
                      </div>
                      <div className="rounded-full bg-white/80 px-3 py-1 text-sm font-semibold">
                        {formatNumber(item.count)}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="stat-tile rounded-2xl p-5">
              <SectionHeader
                title="风险雷达"
                hint="把回款、资金、合规、运营和资产组合拆开看。"
              />
              <div className="mt-4 space-y-3">
                {smart.riskRadar.map((item) => (
                  <div key={item.key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.summary}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-slate-900">{item.score}</div>
                        <div className="text-xs text-slate-500">{item.status}</div>
                      </div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-slate-900 transition-all"
                        style={{ width: `${item.score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="stat-tile rounded-2xl p-5">
              <SectionHeader
                title="预警结构"
                hint="今天到期、近期到期和逾期层级可以一起看。"
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MiniStat
                  label="今日到期"
                  value={formatCurrency(smart.alerts.dueTodayTotal)}
                  sub={`${formatNumber(smart.overdue.total)} 笔逾期存量`}
                />
                <MiniStat
                  label="3天内到期"
                  value={formatCurrency(smart.alerts.due3DayTotal)}
                  sub="适合提前提醒"
                />
                <MiniStat
                  label="7天内到期"
                  value={formatCurrency(smart.alerts.due7DayTotal)}
                  sub="便于安排催收节奏"
                />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <LevelCard label="轻度逾期" value={smart.overdue.mild} tone="blue" />
                <LevelCard label="中度逾期" value={smart.overdue.moderate} tone="amber" />
                <LevelCard label="严重逾期" value={smart.overdue.severe} tone="red" />
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <CustomerList
              title="高价值客户"
              items={smart.customers.topBorrowers.map((item) => ({
                title: item.name,
                meta: `${item.valueTier} · ${item.riskLevel}`,
                detail: `${formatCurrency(item.totalBorrowed)} · 活跃借款 ${item.activeLoans} 笔`,
              }))}
              empty="当前还没有可识别的高价值客户。"
            />
            <CustomerList
              title="风险客户"
              items={smart.customers.riskCustomers.map((item) => ({
                title: item.name,
                meta: `${item.riskLevel}${item.hasExpiredKyc ? " · KYC过期" : ""}`,
                detail: `${formatCurrency(item.totalBorrowed)} · 逾期 ${item.overdueCount} 笔`,
              }))}
              empty="当前没有风险客户。"
            />
            <CustomerList
              title="复借机会"
              items={smart.customers.potentialReborrow.map((item) => ({
                title: item.name,
                meta: `${item.settledLoans} 笔已结清`,
                detail: `${formatCurrency(item.totalBorrowed)} 历史借款`,
              }))}
              empty="当前没有明显的复借机会客户。"
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="stat-tile rounded-2xl p-5">
            <SectionHeader title="资金预测" hint="用资金池、应回款和待放款，预判未来 7 天压力。" />
            <div className="mt-4 space-y-3">
              <DataRow label="资金池余额" value={formatCurrency(smart.cashflow.fundBalance)} />
              <DataRow label="7天预期回款" value={formatCurrency(smart.cashflow.expectedCollections7d)} />
              <DataRow label="30天预期回款" value={formatCurrency(smart.cashflow.expectedCollections30d)} />
              <DataRow
                label="待放款占用"
                value={formatCurrency(smart.cashflow.pendingDisbursementAmount)}
              />
              <DataRow
                label="7天净流入"
                value={formatCurrency(smart.cashflow.predictedNetInflow7d)}
                tone={smart.cashflow.predictedNetInflow7d >= 0 ? "success" : "danger"}
              />
              <DataRow
                label="30澶╁噣娴佸叆"
                value={formatCurrency(smart.cashflow.predictedNetInflow30d)}
                tone={smart.cashflow.predictedNetInflow30d >= 0 ? "success" : "danger"}
              />
              <DataRow
                label="7澶╄祫閲戠己鍙?"
                value={formatCurrency(smart.cashflow.fundingGap7d)}
                tone={smart.cashflow.fundingGap7d > 0 ? "danger" : "success"}
              />
              <DataRow
                label="30澶╄祫閲戠己鍙?"
                value={formatCurrency(smart.cashflow.fundingGap30d)}
                tone={smart.cashflow.fundingGap30d > 0 ? "warn" : "success"}
              />
              <DataRow
                label="资金覆盖率"
                value={`${smart.cashflow.coverageRatio.toFixed(2)}x`}
                tone={smart.cashflow.coverageRatio >= 1.2 ? "success" : smart.cashflow.coverageRatio >= 1 ? "warn" : "danger"}
              />
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">判断</div>
              <p className="mt-1 text-sm text-slate-600">
                当前资金状态为 <span className="font-semibold text-slate-900">{smart.cashflow.pressureLevel}</span>。
              </p>
            </div>
          </div>

          <div className="stat-tile rounded-2xl p-5">
            <SectionHeader title="合规与资料" hint="把 KYC 补齐情况独立出来，避免业务推进过快。" />
            <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <MiniStat label="待补KYC" value={formatNumber(smart.compliance.pendingKyc)} sub="可安排资料催办" />
              <MiniStat label="已过期" value={formatNumber(smart.compliance.expiredKyc)} sub="需要优先处理" />
              <MiniStat label="30天内到期" value={formatNumber(smart.compliance.expiringSoonKyc)} sub="可提前续期" />
            </div>
          </div>

          <div className="stat-tile rounded-2xl p-5">
            <SectionHeader title="流程积压" hint="看审批、签约、出款、核销四个环节有没有卡住。" />
            <div className="mt-4 space-y-3">
              <PipelineCard
                title="借款申请"
                total={smart.pipeline.applications.total}
                extra={`超时 ${smart.pipeline.applications.olderThan3d} · 高风险 ${smart.pipeline.applications.highRisk}`}
              />
              <PipelineCard
                title="待签合同"
                total={smart.pipeline.contracts.total}
                extra={`超时 ${smart.pipeline.contracts.olderThan2d}`}
              />
              <PipelineCard
                title="待放款"
                total={smart.pipeline.disbursements.total}
                extra={`超时 ${smart.pipeline.disbursements.olderThan1d} · ${formatCurrency(smart.pipeline.disbursements.totalAmount)}`}
              />
              <PipelineCard
                title="待核销还款"
                total={smart.pipeline.repayments.total}
                extra={`超时 ${smart.pipeline.repayments.olderThan1d} · ${formatCurrency(smart.pipeline.repayments.totalAmount)}`}
              />
              <PipelineCard
                title="展期 / 重组"
                total={smart.pipeline.extensionsPending + smart.pipeline.restructuresPending}
                extra={`展期 ${smart.pipeline.extensionsPending} · 重组 ${smart.pipeline.restructuresPending}`}
              />
            </div>
          </div>

          <div className="stat-tile rounded-2xl p-5">
            <SectionHeader title="系统建议" hint="不是数据堆砌，而是直接给出下一步动作。" />
            <div className="mt-4 space-y-3">
              {smart.health.insights.map((item) => (
                <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="stat-tile rounded-2xl p-5">
            <SectionHeader title="智能催收分层" hint="把到期前、到期日和逾期节点拆开，方便上线自动触达。" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {smart.collectionAutomation.stages.map((item) => (
                <MiniStat
                  key={item.code}
                  label={item.label}
                  value={`${formatNumber(item.count)} 笔`}
                  sub={formatCurrency(item.amount)}
                />
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              当前需自动跟进 {formatNumber(smart.collectionAutomation.activeCases)} 笔，
              {smart.collectionAutomation.externalTouchpointsEnabled ? "已支持站内 + 外部渠道联动。" : "暂未打通外部渠道。"}
            </div>
          </div>

          <div className="stat-tile rounded-2xl p-5">
            <SectionHeader title="风险评分引擎" hint="客户行为分、复借分和逾期概率，已经形成可运营的推荐视图。" />
            <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <MiniStat
                label="平均风险分"
                value={formatNumber(smart.riskEngine.averageRecommendedRiskScore)}
                sub={`逾期概率 ${formatNumber(smart.riskEngine.overdueProbabilityAverage)}%`}
              />
              <MiniStat
                label="高风险客户"
                value={formatNumber(smart.riskEngine.highRiskCustomers)}
                sub={`黑名单候选 ${formatNumber(smart.riskEngine.blacklistCandidates)}`}
              />
              <MiniStat
                label="复借候选"
                value={formatNumber(smart.riskEngine.repeatBorrowCandidates)}
                sub="可做精细化二次营销"
              />
            </div>
            <div className="mt-4 space-y-3">
              {smart.riskEngine.topSignals.map((item) => (
                <div key={item.customerId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{item.name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {item.recommendedRiskLevel} · 逾期概率 {item.overdueProbability}%
                      </div>
                    </div>
                    <div className="text-lg font-bold text-slate-900">{item.recommendedRiskScore}</div>
                  </div>
                  <div className="mt-2 text-sm text-slate-600">{item.reasons.join(" / ") || "暂无额外风险说明"}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="stat-tile rounded-2xl p-5">
            <SectionHeader title="异常检测" hint="同设备多账号、资料频繁改动、申请突增和异常提现统一收口。" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MiniStat
                label="异常总数"
                value={formatNumber(smart.anomalies.total)}
                sub={`高危 ${formatNumber(smart.anomalies.critical)} · 高风险 ${formatNumber(smart.anomalies.high)}`}
              />
              <MiniStat
                label="共享设备"
                value={formatNumber(smart.anomalies.byType.sharedDevice)}
                sub={`资料频改 ${formatNumber(smart.anomalies.byType.profileChurn)}`}
              />
              <MiniStat
                label="申请突增"
                value={formatNumber(smart.anomalies.byType.applicationBurst)}
                sub={`异常提现 ${formatNumber(smart.anomalies.byType.withdrawalSpike)}`}
              />
              <MiniStat
                label="资金方预测"
                value={formatCurrency(smart.financialForecast.funderInterest30d)}
                sub="未来 30 天预估收益"
              />
            </div>
            <div className="mt-4 space-y-3">
              {smart.anomalies.incidents.map((item) => (
                <div key={`${item.type}-${item.entityId}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-slate-900">{item.title}</div>
                    <div className="text-xs uppercase text-slate-500">{item.severity}</div>
                  </div>
                  <div className="mt-2 text-sm text-slate-600">{item.summary}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="stat-tile rounded-2xl p-5">
            <SectionHeader title="经营仪表盘" hint="先把上线运营最关键的获客、转化、坏账和净利润打通。" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MiniStat
                label="CAC 7天"
                value={formatCurrency(smart.operations.cac7d)}
                sub={`营销投入 ${formatCurrency(smart.operations.marketingSpend7d)}`}
              />
              <MiniStat
                label="CAC 30天"
                value={formatCurrency(smart.operations.cac30d)}
                sub={`新增客户 ${formatNumber(smart.operations.newCustomers30d)}`}
              />
              <MiniStat
                label="审批转化"
                value={formatPercent(smart.operations.approvalConversion30d)}
                sub={`放款转化 ${formatPercent(smart.operations.disbursementConversion30d)}`}
              />
              <MiniStat
                label="坏账率"
                value={formatPercent(smart.operations.badDebtRate)}
                sub={`周转天数 ${smart.operations.capitalTurnoverDays.toFixed(1)} 天`}
              />
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm text-slate-500">真实净利润（30 天）</div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {formatCurrency(smart.operations.realNetProfit30d)}
              </div>
              <div className="mt-1 text-xs text-slate-500">已扣除营销投入与资金方收益预测成本。</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="活跃借款"
          value={formatNumber(summary.activeLoanCount)}
          note={`在库客户 ${formatNumber(smart.customers.total)} 人`}
        />
        <MetricCard
          title="资金池余额"
          value={formatCurrency(summary.funderBalance)}
          note={`7天到期 ${formatCurrency(summary.upcomingDue7d)}`}
        />
        <MetricCard
          title="总利润"
          value={formatCurrency(summary.totalProfit)}
          note={`利润率 ${formatPercent(Number(summary.profitRate || 0))}`}
          tone="success"
        />
        <MetricCard
          title="待签合同"
          value={formatNumber(summary.pendingSignContract)}
          note={`逾期笔数 ${formatNumber(summary.overdueCount)}`}
        />
      </section>
    </div>
  );
}

function MetricCard({
  title,
  value,
  note,
  tone = "default",
}: {
  title: string;
  value: string;
  note: string;
  tone?: "default" | "success" | "warn" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "danger"
          ? "text-red-700"
          : "text-slate-900";

  return (
    <div className="stat-tile rounded-2xl p-5">
      <p className="text-sm text-slate-500">{title}</p>
      <div className={`mt-3 text-3xl font-bold tracking-tight ${toneClass}`}>{value}</div>
      <p className="mt-2 text-sm text-slate-500">{note}</p>
    </div>
  );
}

function SectionHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{hint}</p>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
    </div>
  );
}

function LevelCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "amber" | "red";
}) {
  const toneClass =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-blue-200 bg-blue-50 text-blue-700";

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="text-sm">{label}</div>
      <div className="mt-2 text-2xl font-bold">{formatNumber(value)}</div>
    </div>
  );
}

function CustomerList({
  title,
  items,
  empty,
}: {
  title: string;
  items: Array<{ title: string; meta: string; detail: string }>;
  empty: string;
}) {
  return (
    <div className="stat-tile rounded-2xl p-5">
      <SectionHeader title={title} hint="按当前智能画像筛选出的优先关注名单。" />
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <EmptyState text={empty} />
        ) : (
          items.map((item) => (
            <div key={`${title}-${item.title}-${item.detail}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">{item.title}</div>
              <div className="mt-1 text-xs text-slate-500">{item.meta}</div>
              <div className="mt-2 text-sm text-slate-700">{item.detail}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DataRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warn" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "danger"
          ? "text-red-700"
          : "text-slate-900";

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-semibold ${toneClass}`}>{value}</span>
    </div>
  );
}

function PipelineCard({
  title,
  total,
  extra,
}: {
  title: string;
  total: number;
  extra: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-700">
          {formatNumber(total)}
        </span>
      </div>
      <div className="mt-2 text-xs text-slate-500">{extra}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">{text}</div>;
}
