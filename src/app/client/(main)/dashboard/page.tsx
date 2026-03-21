import Link from "next/link";
import { getClientSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ConfirmReceivedButton } from "@/components/client/ConfirmReceivedButton";
import RealtimeTimer from "@/components/RealtimeTimer";
import { getStatusLabel } from "@/lib/status-ui";
import {
  DEFAULT_OVERDUE,
  DEFAULT_TIERS,
  DEFAULT_UPFRONT_FEE_RATE,
  loadFeeConfig,
  parseTiersFromPricingRules,
  type ChannelType,
  type OverdueConfig,
  type RepaymentTier,
} from "@/lib/interest-engine";

function money(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function diffDays(target: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(target);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

export default async function ClientDashboardPage() {
  const session = await getClientSession();

  if (!session) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <p className="text-slate-500">登录已过期，请重新登录。</p>
        <Link href="/client/login" className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
          重新登录
        </Link>
      </div>
    );
  }

  const application = await prisma.loanApplication.findFirst({
    where: {
      customerId: session.sub,
      deletedAt: null,
      status: {
        notIn: ["SETTLED", "COMPLETED", "REJECTED"],
      },
    },
    orderBy: { createdAt: "desc" },
    include: {
      product: {
        include: {
          pricingRules: {
            where: { isActive: true },
            orderBy: { priority: "desc" },
          },
        },
      },
      contracts: {
        select: { id: true, status: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      disbursement: {
        select: {
          id: true,
          disbursementNo: true,
          status: true,
          amount: true,
          feeAmount: true,
          netAmount: true,
          disbursedAt: true,
        },
      },
    },
  });

  if (!application) {
    return (
      <div className="space-y-6">
        <header className="panel-soft rounded-2xl px-5 py-4">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">我的借款</h1>
          <p className="mt-1 text-sm text-slate-600">客户端现在只展示当前有效借款，不展示历史订单。</p>
        </header>

        <div className="panel-soft rounded-2xl p-6 text-center">
          <h2 className="text-lg font-semibold text-slate-900">当前没有进行中的借款</h2>
          <p className="mt-2 text-sm text-slate-500">
            当有新的申请、签约或放款流程时，这里会只展示当前这一笔借款的规则、应还金额和提醒。
          </p>
        </div>
      </div>
    );
  }

  const plan = await prisma.repaymentPlan.findFirst({
    where: { applicationId: application.id, status: "ACTIVE" },
    select: {
      id: true,
      planNo: true,
      rulesSnapshotJson: true,
      totalPrincipal: true,
      totalInterest: true,
      totalFee: true,
      totalPeriods: true,
      scheduleItems: {
        orderBy: { dueDate: "asc" },
        select: {
          id: true,
          periodNumber: true,
          dueDate: true,
          principal: true,
          interest: true,
          fee: true,
          totalDue: true,
          remaining: true,
          status: true,
        },
      },
    },
  });

  const overdueRecord = await prisma.overdueRecord.findFirst({
    where: { applicationId: application.id, status: "OVERDUE" },
    orderBy: { overdueDays: "desc" },
    select: {
      overdueDays: true,
      overdueAmount: true,
      penaltyAmount: true,
    },
  });

  const pendingReceiptRepayment = plan
    ? await prisma.repayment.findFirst({
        where: {
          planId: plan.id,
          status: "CUSTOMER_CONFIRMED",
        },
        orderBy: { updatedAt: "desc" },
        select: {
          repaymentNo: true,
          amount: true,
        },
      })
    : null;

  const systemSettings = await prisma.systemSetting.findMany();
  const systemMap: Record<string, string | number> = {};
  systemSettings.forEach((item) => {
    systemMap[item.key] = item.value;
  });

  let tiers: RepaymentTier[] = DEFAULT_TIERS;
  let overdueConfig: OverdueConfig = DEFAULT_OVERDUE;
  let channel: ChannelType = "UPFRONT_DEDUCTION";
  let upfrontFeeRate = DEFAULT_UPFRONT_FEE_RATE;

  if (plan?.rulesSnapshotJson) {
    try {
      const snapshot = JSON.parse(plan.rulesSnapshotJson);
      if (snapshot.tiers) tiers = snapshot.tiers;
      if (snapshot.overdueConfig) overdueConfig = snapshot.overdueConfig;
      if (snapshot.channel) channel = snapshot.channel;
      if (snapshot.upfrontFeeRate != null) upfrontFeeRate = snapshot.upfrontFeeRate;
    } catch {
      // fall back to current config
    }
  } else if (application.product.pricingRules.length > 0) {
    const parsed = parseTiersFromPricingRules(application.product.pricingRules);
    tiers = parsed.tiers;
    overdueConfig = parsed.overdueConfig;
    channel = parsed.channel;
    upfrontFeeRate = parsed.upfrontFeeRate;
  } else {
    const parsed = loadFeeConfig(systemMap);
    tiers = parsed.tiers;
    overdueConfig = parsed.overdueConfig;
    channel = parsed.channel;
    upfrontFeeRate = parsed.upfrontFeeRate;
  }

  const nextItem = plan?.scheduleItems.find((item) => ["PENDING", "PARTIAL", "OVERDUE"].includes(item.status)) || null;
  const totalPlanAmount = plan
    ? Number(plan.totalPrincipal) + Number(plan.totalInterest) + Number(plan.totalFee)
    : 0;
  const outstandingAmount = plan
    ? plan.scheduleItems.reduce((sum, item) => sum + Number(item.remaining || item.totalDue || 0), 0)
    : 0;
  const nextDueAmount = nextItem ? Number(nextItem.remaining || nextItem.totalDue || 0) : 0;
  const nextDueInDays = nextItem ? diffDays(nextItem.dueDate) : null;
  const netAmount = Number(application.disbursement?.netAmount || 0);
  const contractFee = Number(application.disbursement?.feeAmount || 0);
  const contractId = application.contracts[0]?.id || null;

  const reminders: string[] = [];
  if (pendingReceiptRepayment) {
    reminders.push(
      `你已提交还款 ${pendingReceiptRepayment.repaymentNo} 的付款报备，金额 ${money(
        Number(pendingReceiptRepayment.amount)
      )}。系统当前按已付款待核验处理；若后台标记未收款，本金会恢复按原规则继续计息。`
    );
  }
  if (application.disbursement?.status === "PAID") {
    reminders.push("系统已显示放款成功，请尽快确认收款，确认后还款计划将正式生效。");
  }
  if (overdueRecord) {
    reminders.push(
      `当前已逾期 ${overdueRecord.overdueDays} 天，累计逾期费用 ${money(Number(overdueRecord.penaltyAmount))}，总逾期金额 ${money(
        Number(overdueRecord.overdueAmount)
      )}。`
    );
  } else if (nextItem && nextDueInDays !== null && nextDueInDays <= 3) {
    reminders.push(`下一笔应还在 ${nextDueInDays <= 0 ? "今天" : `${nextDueInDays} 天内`}到期，请提前准备 ${money(nextDueAmount)}。`);
  } else if (nextItem) {
    reminders.push(`下一笔应还日期为 ${formatDate(nextItem.dueDate)}，本期需支付 ${money(nextDueAmount)}。`);
  }
  if (channel === "UPFRONT_DEDUCTION") {
    reminders.push("本笔借款为砍头息模式，实际到账金额会少于借款本金，请以合同和当前页面展示为准。");
  }
  if (reminders.length === 0) {
    reminders.push("当前借款状态正常，如有新提醒会第一时间显示在这里。");
  }

  return (
    <div className="space-y-6">
      <header className="panel-soft rounded-2xl px-5 py-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">我的借款</h1>
        <p className="mt-1 text-sm text-slate-600">
          这里只展示你当前正在处理的这一笔借款，不显示历史借款记录。
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="当前状态" value={getStatusLabel(application.status)} note={application.applicationNo} />
        <SummaryCard title="借款本金" value={money(Number(application.amount))} note={application.product.name} />
        <SummaryCard title="实际到账" value={money(netAmount)} note={`合同费用 ${money(contractFee)}`} />
        <SummaryCard
          title="下一次应还"
          value={nextItem ? money(nextDueAmount) : "暂无"}
          note={nextItem ? `${formatDate(nextItem.dueDate)} · 第 ${nextItem.periodNumber} 期` : "等待还款计划生成"}
        />
      </section>

      {application.status === "DISBURSED" && application.disbursement?.status === "PAID" ? (
        <RealtimeTimer applicationId={application.id} />
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="stat-tile rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-slate-900">本笔借款概览</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <InfoRow label="借款编号" value={application.applicationNo} />
              <InfoRow label="产品名称" value={application.product.name} />
              <InfoRow label="借款本金" value={money(Number(application.amount))} />
              <InfoRow label="放款状态" value={application.disbursement ? getStatusLabel(application.disbursement.status) : "待放款"} />
              <InfoRow label="合同总应还" value={plan ? money(totalPlanAmount) : "待生成"} />
              <InfoRow label="当前待还余额" value={plan ? money(outstandingAmount) : "待生成"} />
              <InfoRow label="放款日期" value={formatDate(application.disbursement?.disbursedAt)} />
              <InfoRow label="还款期数" value={plan ? `${plan.totalPeriods} 期` : "待生成"} />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {application.disbursement?.status === "PAID" ? <ConfirmReceivedButton disbursementId={application.disbursement.id} /> : null}
              {contractId ? (
                <Link
                  href={`/client/sign/contract/${contractId}`}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:no-underline"
                >
                  查看合同
                </Link>
              ) : null}
              <Link
                href="/client/repayment-plans"
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:no-underline"
              >
                查看当前还款计划
              </Link>
              <Link
                href="/client/repayments"
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:no-underline"
              >
                处理当前还款
              </Link>
            </div>
          </div>

          <div className="stat-tile rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-slate-900">借款规则说明</h2>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">正常还款规则</div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  {tiers
                    .sort((a, b) => a.maxDays - b.maxDays)
                    .map((tier) => (
                      <div key={`${tier.label}-${tier.maxDays}`} className="flex items-center justify-between gap-3">
                        <span>{tier.label}</span>
                        <span className="font-medium text-slate-900">{tier.ratePercent}% / 本金</span>
                      </div>
                    ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">逾期费用规则</div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <div>宽限期：到期后 {overdueConfig.graceHours} 小时内不计逾期。</div>
                  <div>前 {overdueConfig.phase1MaxDays} 天：按本金 {overdueConfig.phase1DailyRate}% / 天计算。</div>
                  <div>之后：按本金 {overdueConfig.phase2DailyRate}% / 天计算。</div>
                  <div>逾期费用按单利累计，不滚复利。</div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">本笔费用结构</div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <div className="flex items-center justify-between gap-3">
                    <span>借款本金</span>
                    <span className="font-medium text-slate-900">{money(Number(application.amount))}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>到账方式</span>
                    <span className="font-medium text-slate-900">{channel === "UPFRONT_DEDUCTION" ? "砍头息" : "全额到账"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>放款手续费</span>
                    <span className="font-medium text-slate-900">{money(contractFee)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>合同利息合计</span>
                    <span className="font-medium text-slate-900">{money(Number(plan?.totalInterest || 0))}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">你需要知道</div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <div>系统当前按单笔借款计算，不会把历史借款混在一起。</div>
                  <div>当前展示的应还金额、费用和提醒都只针对这一笔订单。</div>
                  <div>如果逾期，逾期费用会每日递增，并在页面实时提醒。</div>
                  <div>放款确认、合同签署和还款确认都以当前这笔借款为准。</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="stat-tile rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-slate-900">智能提醒</h2>
            <div className="mt-4 space-y-3">
              {reminders.map((reminder) => (
                <div key={reminder} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  {reminder}
                </div>
              ))}
            </div>
          </div>

          {plan ? (
            <div className="stat-tile rounded-2xl p-5">
              <h2 className="text-lg font-semibold text-slate-900">当前还款计划</h2>
              <div className="mt-4 space-y-3">
                {plan.scheduleItems.slice(0, 4).map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-slate-900">第 {item.periodNumber} 期</div>
                        <div className="mt-1 text-xs text-slate-500">到期日 {formatDate(item.dueDate)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-slate-900">{money(Number(item.remaining || item.totalDue || 0))}</div>
                        <div className="mt-1 text-xs text-slate-500">{getStatusLabel(item.status)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {overdueRecord ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <h2 className="text-lg font-semibold text-red-700">逾期提醒</h2>
              <div className="mt-4 space-y-2 text-sm text-red-700">
                <div>逾期天数：{overdueRecord.overdueDays} 天</div>
                <div>累计逾期费用：{money(Number(overdueRecord.penaltyAmount))}</div>
                <div>当前逾期总额：{money(Number(overdueRecord.overdueAmount))}</div>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <div className="stat-tile rounded-2xl p-5">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-3 text-2xl font-bold text-slate-900">{value}</div>
      <div className="mt-2 text-xs text-slate-500">{note}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}
