"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SummaryData = Record<string, any>;
type SmartData = Record<string, any>;
type Tone = "default" | "success" | "warn" | "danger";

type WorkbenchRow = {
  title: string;
  subtitle: string;
  primary: string;
  secondary: string;
  href: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error((await response.text()) || "加载失败");
  return response.json();
}

function formatCurrency(value: number | string) {
  return `€${new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 0,
  }).format(Number(value || 0))}`;
}

function formatNumber(value: number | string) {
  return new Intl.NumberFormat("zh-CN").format(Number(value || 0));
}

function formatPercent(value: number | string) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getToneClass(tone: Tone) {
  if (tone === "success") return "text-emerald-700";
  if (tone === "warn") return "text-amber-700";
  if (tone === "danger") return "text-red-700";
  return "text-slate-900";
}

export function DashboardSummary() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [smart, setSmart] = useState<SmartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadData = async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);

    try {
      const [summaryData, smartData] = await Promise.all([
        fetchJson<SummaryData>("/api/dashboard/summary"),
        fetchJson<SmartData>("/api/dashboard/smart"),
      ]);

      setSummary(summaryData);
      setSmart(smartData);
      setError(null);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
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
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="stat-tile h-72 animate-pulse rounded-[30px] xl:col-span-8" />
        <div className="stat-tile h-72 animate-pulse rounded-[30px] xl:col-span-4" />
        <div className="stat-tile h-80 animate-pulse rounded-[30px] xl:col-span-12" />
        <div className="stat-tile h-72 animate-pulse rounded-[30px] xl:col-span-4" />
        <div className="stat-tile h-72 animate-pulse rounded-[30px] xl:col-span-4" />
        <div className="stat-tile h-72 animate-pulse rounded-[30px] xl:col-span-4" />
      </div>
    );
  }

  if (error || !summary || !smart) {
    return (
      <div className="rounded-[30px] border border-red-200 bg-red-50 p-6 text-red-700">
        <div className="text-lg font-semibold">首页数据加载失败</div>
        <p className="mt-2 text-sm">{error || "请稍后重试。"}</p>
        <button
          onClick={() => void loadData()}
          className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white"
        >
          重新加载
        </button>
      </div>
    );
  }

  const urgentCount = (smart.smartTodos || []).filter((item: any) =>
    item.urgency === "critical" || item.urgency === "high",
  ).length;

  return (
    <div className="space-y-5">
      <section className="grid gap-5 xl:grid-cols-12">
        <Panel className="xl:col-span-8">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.95fr)] xl:items-end">
            <div className="min-w-0">
              <div className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold tracking-[0.18em] text-slate-500">
                ADMIN OVERVIEW
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <h2 className="text-3xl font-bold tracking-tight text-slate-900 xl:text-4xl">
                  全屏运营工作台
                </h2>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
                  今日高优先任务 {formatNumber(urgentCount)} 项
                </span>
              </div>
              <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-600 xl:text-base">
                把借款申请、到期还款、逾期催收、资金入金和利润监控压在同一屏内，
                先看今天谁申请、谁应还、谁逾期，再直接进入处理。
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <HeroMetric
                label="健康评分"
                value={formatNumber(smart.health?.score)}
                sub={`准时率 ${formatPercent(smart.health?.onTimeRate)}`}
                tone="success"
              />
              <HeroMetric
                label="7天覆盖率"
                value={`${Number(smart.cashflow?.coverageRatio || 0).toFixed(2)}x`}
                sub={`净流入 ${formatCurrency(smart.cashflow?.predictedNetInflow7d)}`}
                tone={Number(smart.cashflow?.coverageRatio) >= 1.2 ? "success" : Number(smart.cashflow?.coverageRatio) >= 1 ? "warn" : "danger"}
              />
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StripMetric
              label="今日借款申请"
              value={formatNumber(smart.workbench?.summary?.loanApplicationsToday)}
              sub="今天新增待审核申请"
            />
            <StripMetric
              label="今日应还"
              value={formatNumber(smart.workbench?.summary?.repaymentsDueToday)}
              sub="今天到期待还款单"
            />
            <StripMetric
              label="今日逾期"
              value={formatNumber(smart.workbench?.summary?.overdueToday)}
              sub="今天新增逾期名单"
            />
            <StripMetric
              label="今日入金"
              value={formatCurrency(smart.financeHub?.todayCapitalInflow)}
              sub={`活跃资金方 ${formatNumber(smart.financeHub?.activeFunders)}`}
            />
          </div>
        </Panel>

        <Panel className="xl:col-span-4">
          <SectionHeader
            title="今日指挥面板"
            hint="用一列压缩展示，保持横向节奏，不再堆成长卡片。"
          />
          <div className="mt-5 space-y-3">
            <DataRow label="今日放款" value={formatCurrency(summary.todayDisbursement)} />
            <DataRow label="今日回款" value={formatCurrency(summary.todayRepayment)} tone="success" />
            <DataRow label="待放款笔数" value={formatNumber(summary.pendingDisbursement)} />
            <DataRow
              label="待确认还款"
              value={formatNumber(summary.pendingConfirmRepayment)}
              tone="warn"
            />
            <DataRow
              label="严重逾期"
              value={formatNumber(smart.overdue?.severe)}
              tone="danger"
            />
            <DataRow label="资金池余额" value={formatCurrency(summary.funderBalance)} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
              30天净利润 {formatCurrency(smart.operations?.realNetProfit30d)}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
              坏账率 {formatPercent(smart.operations?.badDebtRate)}
            </span>
            {lastUpdated ? (
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                更新于 {lastUpdated.toLocaleTimeString("zh-CN", { hour12: false })}
              </span>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionChip href="/admin/loan-applications" primary>
              处理借款
            </ActionChip>
            <ActionChip href="/admin/repayments">处理还款</ActionChip>
            <ActionChip href="/admin/overdue">处理逾期</ActionChip>
            <button
              onClick={() => void loadData("refresh")}
              disabled={refreshing}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {refreshing ? "刷新中..." : "刷新数据"}
            </button>
          </div>
        </Panel>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <MetricCard
          title="今日放款"
          value={formatCurrency(summary.todayDisbursement)}
          note={`待放款 ${formatNumber(summary.pendingDisbursement)} 笔`}
        />
        <MetricCard
          title="今日回款"
          value={formatCurrency(summary.todayRepayment)}
          note={`待确认 ${formatNumber(summary.pendingConfirmRepayment)} 笔`}
        />
        <MetricCard
          title="逾期敞口"
          value={formatCurrency(smart.overdue?.totalAmount)}
          note={`严重逾期 ${formatNumber(smart.overdue?.severe)} 笔`}
          tone="danger"
        />
        <MetricCard
          title="资金池余额"
          value={formatCurrency(summary.funderBalance)}
          note={`7天应回 ${formatCurrency(summary.upcomingDue7d)}`}
        />
        <MetricCard
          title="活跃借款"
          value={formatNumber(summary.activeLoanCount)}
          note={`客户总数 ${formatNumber(smart.customers?.total)}`}
        />
        <MetricCard
          title="累计利润"
          value={formatCurrency(summary.totalProfit)}
          note={`利润率 ${formatPercent(summary.profitRate)}`}
          tone="success"
        />
        <MetricCard
          title="待签合同"
          value={formatNumber(summary.pendingSignContract)}
          note={`逾期笔数 ${formatNumber(summary.overdueCount)}`}
        />
        <MetricCard
          title="今日入金"
          value={formatCurrency(smart.financeHub?.todayCapitalInflow)}
          note={`活跃资金方 ${formatNumber(smart.financeHub?.activeFunders)}`}
        />
      </section>

      <Panel>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <SectionHeader
            title="今日工作轨道"
            hint="三条横向工作流并排展示，先看申请，再看应还，再看逾期。"
          />
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            工作台已切换为宽屏模式，桌面端优先展示横向信息流。
          </div>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          <WorkbenchLane
            title="今日借款申请"
            count={smart.workbench?.summary?.loanApplicationsToday}
            actionHref="/admin/loan-applications"
            actionLabel="去审申请"
            emptyText="今天还没有新的借款申请。"
            items={smart.workbench?.todayLoanApplications || []}
            mapItem={(item: any): WorkbenchRow => ({
              title: item.customerName,
              subtitle: `${item.applicationNo} · ${item.phone || "未留电话"}`,
              primary: `金额 ${formatCurrency(item.amount)}`,
              secondary: `${item.riskLevel} · ${formatDateTime(item.createdAt)}`,
              href: item.href,
            })}
          />
          <WorkbenchLane
            title="今日应还名单"
            count={smart.workbench?.summary?.repaymentsDueToday}
            actionHref="/admin/repayments"
            actionLabel="去看还款"
            emptyText="今天没有到期应还账单。"
            items={smart.workbench?.todayRepayments || []}
            mapItem={(item: any): WorkbenchRow => ({
              title: item.customerName,
              subtitle: `${item.planNo} · ${item.phone || "未留电话"}`,
              primary: `应还 ${formatCurrency(item.amount)}`,
              secondary: `${item.status} · ${formatDateTime(item.dueDate)}`,
              href: item.href,
            })}
          />
          <WorkbenchLane
            title="今日逾期名单"
            count={smart.workbench?.summary?.overdueToday}
            actionHref="/admin/overdue"
            actionLabel="去催收"
            emptyText="今天没有新增逾期。"
            tone="danger"
            items={smart.workbench?.todayOverdues || []}
            mapItem={(item: any): WorkbenchRow => ({
              title: item.customerName,
              subtitle: `${item.phone || "未留电话"} · ${item.riskLevel}`,
              primary: `逾期 ${formatCurrency(item.overdueAmount)}`,
              secondary: `罚息 ${formatCurrency(item.penaltyAmount)} · ${item.overdueDays} 天`,
              href: item.href,
            })}
          />
        </div>
      </Panel>

      <section className="grid gap-5 xl:grid-cols-12">
        <Panel className="xl:col-span-4">
          <SectionHeader
            title="财务入口"
            hint="入金、结算、提现审批和流水查询都压进同一区域。"
          />
          <div className="mt-5 grid gap-3">
            <StripMetric
              label="活跃资金方"
              value={formatNumber(smart.financeHub?.activeFunders)}
              sub="当前可参与出资"
            />
            <StripMetric
              label="资金账户"
              value={formatNumber(smart.financeHub?.activeFundAccounts)}
              sub="当前可用入金账户"
            />
            <StripMetric
              label="今日入金"
              value={formatCurrency(smart.financeHub?.todayCapitalInflow)}
              sub="已确认注资金额"
            />
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600">
            进入“财务中心”或“资金方”，选择资金方账户后录入金额、渠道和备注，
            系统会直接写入数据库，并同步增加资金池余额与资金流水。
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionChip href="/admin/finance" primary>
              财务中心
            </ActionChip>
            <ActionChip href="/admin/funders">录入入金</ActionChip>
            <ActionChip href="/admin/settlement">结算中心</ActionChip>
            <ActionChip href="/admin/funder-withdrawals">提现审批</ActionChip>
            <ActionChip href="/admin/ledger">资金流水</ActionChip>
          </div>
          <div className="mt-4 space-y-2">
            {(smart.financeHub?.recentInflows || []).length === 0 ? (
              <EmptyState text="今天还没有确认入金记录。" />
            ) : (
              (smart.financeHub?.recentInflows || []).map((item: any) => (
                <FlowRow
                  key={item.id}
                  left={item.funderName}
                  sub={`${item.accountName} · ${item.channel} · ${formatDateTime(item.inflowDate)}`}
                  right={formatCurrency(item.amount)}
                />
              ))
            )}
          </div>
        </Panel>

        <Panel className="xl:col-span-4">
          <SectionHeader
            title="资金预测"
            hint="改成横向数据条，减少卡片上下堆叠。"
          />
          <div className="mt-5 space-y-3">
            <DataRow label="资金池余额" value={formatCurrency(smart.cashflow?.fundBalance)} />
            <DataRow label="7天预期回款" value={formatCurrency(smart.cashflow?.expectedCollections7d)} />
            <DataRow label="30天预期回款" value={formatCurrency(smart.cashflow?.expectedCollections30d)} />
            <DataRow label="待放款占用" value={formatCurrency(smart.cashflow?.pendingDisbursementAmount)} />
            <DataRow
              label="7天净流入"
              value={formatCurrency(smart.cashflow?.predictedNetInflow7d)}
              tone={Number(smart.cashflow?.predictedNetInflow7d) >= 0 ? "success" : "danger"}
            />
            <DataRow
              label="30天净流入"
              value={formatCurrency(smart.cashflow?.predictedNetInflow30d)}
              tone={Number(smart.cashflow?.predictedNetInflow30d) >= 0 ? "success" : "danger"}
            />
            <DataRow
              label="7天资金缺口"
              value={formatCurrency(smart.cashflow?.fundingGap7d)}
              tone={Number(smart.cashflow?.fundingGap7d) > 0 ? "danger" : "success"}
            />
            <DataRow
              label="30天资金缺口"
              value={formatCurrency(smart.cashflow?.fundingGap30d)}
              tone={Number(smart.cashflow?.fundingGap30d) > 0 ? "warn" : "success"}
            />
          </div>
        </Panel>

        <Panel className="xl:col-span-4">
          <SectionHeader
            title="智能行动清单"
            hint="改为紧凑型横向行卡，优先级和入口一眼能看完。"
          />
          <div className="mt-5 space-y-3">
            {(smart.smartTodos || []).slice(0, 8).map((item: any) => (
              <Link
                key={`${item.type}-${item.href}`}
                href={item.href}
                className={`block rounded-2xl border px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-sm hover:no-underline ${
                  item.urgency === "critical"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : item.urgency === "high"
                      ? "border-orange-200 bg-orange-50 text-orange-700"
                      : item.urgency === "medium"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-blue-200 bg-blue-50 text-blue-700"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold tracking-[0.12em]">
                      {String(item.urgency).toUpperCase()}
                    </div>
                    <div className="mt-1 truncate text-base font-semibold">{item.label}</div>
                    <p className="mt-1 text-sm leading-6 opacity-90">{item.description}</p>
                  </div>
                  <div className="rounded-full bg-white/85 px-3 py-1 text-sm font-bold">
                    {formatNumber(item.count)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid gap-5 xl:grid-cols-12">
        <Panel className="xl:col-span-3">
          <SectionHeader
            title="风险雷达"
            hint="每个维度一行横向读数，避免碎片化。"
          />
          <div className="mt-5 space-y-3">
            {(smart.riskRadar || []).map((item: any) => (
              <RadarRow
                key={item.key}
                label={item.label}
                score={item.score}
                summary={item.summary}
                status={item.status}
              />
            ))}
          </div>
        </Panel>

        <Panel className="xl:col-span-5">
          <SectionHeader
            title="预警结构"
            hint="把到期、逾期、健康洞察压成一块。"
          />
          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <StripMetric label="今日到期" value={formatCurrency(smart.alerts?.dueTodayTotal)} sub="今天应收" compact />
            <StripMetric label="3天到期" value={formatCurrency(smart.alerts?.due3DayTotal)} sub="适合提前提醒" compact />
            <StripMetric label="7天到期" value={formatCurrency(smart.alerts?.due7DayTotal)} sub="便于安排节奏" compact />
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <LevelBox label="轻度逾期" value={smart.overdue?.mild} tone="blue" />
            <LevelBox label="中度逾期" value={smart.overdue?.moderate} tone="amber" />
            <LevelBox label="严重逾期" value={smart.overdue?.severe} tone="red" />
          </div>
          <div className="mt-4 space-y-2">
            {(smart.health?.insights || []).map((item: string) => (
              <div
                key={item}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600"
              >
                {item}
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="xl:col-span-4">
          <SectionHeader
            title="流程与经营"
            hint="审批、签约、核销和经营指标统一快读。"
          />
          <div className="mt-5 space-y-3">
            <PipelineRow
              title="借款申请"
              total={smart.pipeline?.applications?.total}
              extra={`超时 ${smart.pipeline?.applications?.olderThan3d} · 高风险 ${smart.pipeline?.applications?.highRisk}`}
            />
            <PipelineRow
              title="待签合同"
              total={smart.pipeline?.contracts?.total}
              extra={`超时 ${smart.pipeline?.contracts?.olderThan2d}`}
            />
            <PipelineRow
              title="待放款"
              total={smart.pipeline?.disbursements?.total}
              extra={`超时 ${smart.pipeline?.disbursements?.olderThan1d} · ${formatCurrency(smart.pipeline?.disbursements?.totalAmount)}`}
            />
            <PipelineRow
              title="待核销还款"
              total={smart.pipeline?.repayments?.total}
              extra={`超时 ${smart.pipeline?.repayments?.olderThan1d} · ${formatCurrency(smart.pipeline?.repayments?.totalAmount)}`}
            />
            <PipelineRow
              title="展期 / 重组"
              total={Number(smart.pipeline?.extensionsPending || 0) + Number(smart.pipeline?.restructuresPending || 0)}
              extra={`展期 ${smart.pipeline?.extensionsPending || 0} · 重组 ${smart.pipeline?.restructuresPending || 0}`}
            />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <StripMetric
              label="30天净利润"
              value={formatCurrency(smart.operations?.realNetProfit30d)}
              sub="已扣营销与资金成本"
            />
            <StripMetric
              label="坏账率"
              value={formatPercent(smart.operations?.badDebtRate)}
              sub={`周转 ${Number(smart.operations?.capitalTurnoverDays || 0).toFixed(1)} 天`}
            />
            <StripMetric
              label="审批转化"
              value={formatPercent(smart.operations?.approvalConversion30d)}
              sub={`放款转化 ${formatPercent(smart.operations?.disbursementConversion30d)}`}
            />
            <StripMetric
              label="CAC 30天"
              value={formatCurrency(smart.operations?.cac30d)}
              sub={`CAC 7天 ${formatCurrency(smart.operations?.cac7d)}`}
            />
          </div>
        </Panel>
      </section>
    </div>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`stat-tile rounded-[30px] p-5 xl:p-6 2xl:p-7 ${className}`}>
      {children}
    </section>
  );
}

function SectionHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h3 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-500">{hint}</p>
    </div>
  );
}

function HeroMetric({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <ResponsiveValue value={value} className={`mt-2 text-[clamp(1.2rem,1.9vw,1.8rem)] ${getToneClass(tone)}`} />
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
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
  tone?: Tone;
}) {
  return (
    <div className="stat-tile rounded-[26px] p-5">
      <div className="text-sm text-slate-500">{title}</div>
      <ResponsiveValue value={value} className={`mt-3 text-[clamp(1.05rem,1.7vw,1.7rem)] ${getToneClass(tone)}`} />
      <div className="mt-2 text-sm text-slate-500">{note}</div>
    </div>
  );
}

function StripMetric({
  label,
  value,
  sub,
  compact = false,
}: {
  label: string;
  value: string;
  sub: string;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-slate-50 ${compact ? "px-4 py-3" : "px-4 py-3"}`}>
      <div className={`flex flex-col gap-2 ${compact ? "xl:flex-row xl:items-center xl:justify-between" : "sm:flex-row sm:items-center sm:justify-between"}`}>
        <div className="min-w-0">
          <div className="text-sm text-slate-500">{label}</div>
          <div className="mt-1 text-xs text-slate-500">{sub}</div>
        </div>
        <ResponsiveValue
          value={value}
          alignClass={compact ? "xl:text-right" : "sm:text-right"}
          className={compact ? "text-[clamp(0.95rem,1.25vw,1.15rem)]" : "text-[clamp(0.95rem,1.35vw,1.25rem)]"}
        />
      </div>
    </div>
  );
}

function WorkbenchLane({
  title,
  count,
  actionHref,
  actionLabel,
  items,
  mapItem,
  emptyText,
  tone = "default",
}: {
  title: string;
  count: number;
  actionHref: string;
  actionLabel: string;
  items: any[];
  mapItem: (item: any) => WorkbenchRow;
  emptyText: string;
  tone?: "default" | "danger";
}) {
  return (
    <div
      className={`rounded-[28px] border p-4 ${
        tone === "danger" ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-slate-50"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="truncate text-base font-semibold text-slate-900">{title}</div>
          <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-700">
            {formatNumber(count)}
          </span>
        </div>
        <Link href={actionHref} className="whitespace-nowrap text-sm font-medium text-blue-600 hover:underline">
          {actionLabel}
        </Link>
      </div>

      <div className="mt-4 space-y-2">
        {items.length === 0 ? (
          <EmptyState text={emptyText} />
        ) : (
          items.map((raw) => {
            const item = mapItem(raw);
            return (
              <Link
                key={`${item.title}-${item.subtitle}-${item.primary}`}
                href={item.href}
                className="block rounded-2xl border border-white/70 bg-white px-4 py-3 transition hover:border-slate-300 hover:no-underline"
              >
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_auto] xl:items-center">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{item.title}</div>
                    <div className="mt-1 truncate text-xs text-slate-500">{item.subtitle}</div>
                  </div>
                  <div className="grid gap-2 text-right sm:grid-cols-2 xl:min-w-[220px] xl:text-left">
                    <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                      {item.primary}
                    </span>
                    <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                      {item.secondary}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

function FlowRow({ left, sub, right }: { left: string; sub: string; right: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{left}</div>
          <div className="mt-1 truncate text-xs text-slate-500">{sub}</div>
        </div>
        <div className="whitespace-nowrap text-sm font-semibold text-emerald-700">{right}</div>
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
  tone?: Tone;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm text-slate-500">{label}</div>
        <ResponsiveValue
          value={value}
          alignClass="sm:text-right"
          className={`text-[clamp(0.95rem,1.2vw,1.1rem)] ${getToneClass(tone)}`}
        />
      </div>
    </div>
  );
}

function RadarRow({
  label,
  score,
  summary,
  status,
}: {
  label: string;
  score: number;
  summary: string;
  status: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">{label}</div>
          <div className="mt-1 text-xs text-slate-500">{summary}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tracking-tight text-slate-900">{score}</div>
          <div className="text-xs text-slate-500">{status}</div>
        </div>
      </div>
      <div className="mt-3 h-2 rounded-full bg-slate-200">
        <div className="h-2 rounded-full bg-slate-900" style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function LevelBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "amber" | "red";
}) {
  const cls =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-blue-200 bg-blue-50 text-blue-700";

  return (
    <div className={`rounded-2xl border p-4 ${cls}`}>
      <div className="text-sm">{label}</div>
      <div className="mt-2 text-[clamp(1.5rem,2vw,2rem)] font-bold tracking-tight">{formatNumber(value)}</div>
    </div>
  );
}

function PipelineRow({ title, total, extra }: { title: string; total: number; extra: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-700">
          {formatNumber(total)}
        </div>
      </div>
      <div className="mt-2 text-xs text-slate-500">{extra}</div>
    </div>
  );
}

function ActionChip({
  href,
  children,
  primary = false,
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-xl px-4 py-2 text-sm font-medium hover:no-underline ${
        primary
          ? "bg-slate-900 text-white hover:bg-slate-800"
          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </Link>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4 text-sm text-slate-500">
      {text}
    </div>
  );
}

function ResponsiveValue({
  value,
  className = "",
  alignClass = "",
}: {
  value: string;
  className?: string;
  alignClass?: string;
}) {
  const trimmed = value.trim();
  const isCurrency = trimmed.startsWith("€");
  const symbol = isCurrency ? "€" : null;
  const body = isCurrency ? trimmed.slice(1) : trimmed;

  return (
    <div
      className={`min-w-0 max-w-full overflow-hidden font-semibold leading-tight tracking-tight text-slate-900 ${alignClass} ${className}`}
      title={value}
    >
      {symbol ? <span className="mr-1 text-[0.82em] align-top">{symbol}</span> : null}
      <span className="break-all whitespace-normal">{body}</span>
    </div>
  );
}
