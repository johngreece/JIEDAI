import Link from "next/link";
import { getClientSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ConfirmReceivedButton } from "@/components/client/ConfirmReceivedButton";
import { LoanApplicationPanel } from "@/components/client/LoanApplicationPanel";
import RealtimeTimer from "@/components/RealtimeTimer";
import { getStatusLabel } from "@/lib/status-ui";
import {
  BUSINESS_LOAN_NOTICE,
  PRODUCT_RULE_DISPLAY,
  PUBLIC_CLIENT_PRODUCT_CODES,
  type PublicClientProductCode,
} from "@/lib/public-loan-products";
import {
  DEFAULT_OVERDUE,
  DEFAULT_TIERS,
  DEFAULT_UPFRONT_FEE_RATE,
  calculateRealtimeRepayment,
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

  const [customer, products, application] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: session.sub },
      select: {
        creditLimit: true,
        creditLimitOverride: true,
      },
    }),
    prisma.loanProduct.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        code: { in: [...PUBLIC_CLIENT_PRODUCT_CODES] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        minAmount: true,
        maxAmount: true,
        minTermValue: true,
        maxTermValue: true,
        termUnit: true,
      },
    }),
    prisma.loanApplication.findFirst({
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
    }),
  ]);

  const availableLimit = Number(customer?.creditLimitOverride ?? customer?.creditLimit ?? 0);

  if (!application) {
    return (
      <div className="space-y-6">
        <header className="panel-soft rounded-2xl px-5 py-4">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">我的借款</h1>
          <p className="mt-1 text-sm text-slate-600">当前没有进行中的借款，下面可以直接查看可借额度并发起新的借款申请。</p>
        </header>

        <LoanApplicationPanel
          availableLimit={availableLimit}
          products={products.map((product) => ({
            id: product.id,
            code: product.code as PublicClientProductCode,
            name: product.name,
            description: product.description,
            minAmount: Number(product.minAmount),
            maxAmount: Number(product.maxAmount),
            minTermValue: product.minTermValue,
            maxTermValue: product.maxTermValue,
            termUnit: product.termUnit,
          }))}
        />
      </div>
    );
  }

  const [plan, overdueRecord, pendingReceiptRepayment] = await Promise.all([
    prisma.repaymentPlan.findFirst({
      where: { applicationId: application.id, status: "ACTIVE" },
      select: {
        id: true,
        planNo: true,
        totalPrincipal: true,
        totalInterest: true,
        totalFee: true,
        totalPeriods: true,
        rulesSnapshotJson: true,
        scheduleItems: {
          orderBy: { dueDate: "asc" },
          select: {
            id: true,
            periodNumber: true,
            dueDate: true,
            totalDue: true,
            remaining: true,
            status: true,
          },
        },
      },
    }),
    prisma.overdueRecord.findFirst({
      where: { applicationId: application.id, status: "OVERDUE" },
      orderBy: { overdueDays: "desc" },
      select: {
        overdueDays: true,
        overdueAmount: true,
        penaltyAmount: true,
      },
    }),
    prisma.repayment.findFirst({
      where: {
        plan: { applicationId: application.id },
        status: "CUSTOMER_CONFIRMED",
      },
      orderBy: { updatedAt: "desc" },
      select: {
        repaymentNo: true,
        amount: true,
      },
    }),
  ]);

  const nextItem = plan?.scheduleItems.find((item) => ["PENDING", "PARTIAL", "OVERDUE"].includes(item.status)) || null;
  const outstandingAmount = plan
    ? plan.scheduleItems.reduce((sum, item) => sum + Number(item.remaining || item.totalDue || 0), 0)
    : 0;
  let displayOutstandingAmount = outstandingAmount;
  const nextDueAmount = nextItem ? Number(nextItem.remaining || nextItem.totalDue || 0) : 0;
  const nextDueInDays = nextItem ? diffDays(nextItem.dueDate) : null;
  const contractId = application.contracts[0]?.id ?? null;
  const netAmount = Number(application.disbursement?.netAmount || 0);
  const contractFee = Number(application.disbursement?.feeAmount || 0);

  if (plan && application.disbursement?.status === "PAID" && application.disbursement.disbursedAt) {
    let tiers: RepaymentTier[] = DEFAULT_TIERS;
    let overdueConfig: OverdueConfig = DEFAULT_OVERDUE;
    let upfrontFeeRate = DEFAULT_UPFRONT_FEE_RATE;
    let channel: ChannelType = "FULL_AMOUNT";
    let dueDate: Date | null = null;

    if (plan.rulesSnapshotJson) {
      try {
        const snapshot = JSON.parse(plan.rulesSnapshotJson) as {
          tiers?: RepaymentTier[];
          overdueConfig?: OverdueConfig;
          upfrontFeeRate?: number;
          channel?: ChannelType;
          dueDate?: string;
        };
        if (snapshot.tiers) tiers = snapshot.tiers;
        if (snapshot.overdueConfig) overdueConfig = snapshot.overdueConfig;
        if (snapshot.upfrontFeeRate != null) upfrontFeeRate = snapshot.upfrontFeeRate;
        if (snapshot.channel) channel = snapshot.channel;
        if (snapshot.dueDate) dueDate = new Date(snapshot.dueDate);
      } catch {
        // ignore invalid snapshot
      }
    } else if (application.product.pricingRules.length > 0) {
      const parsed = parseTiersFromPricingRules(application.product.pricingRules);
      tiers = parsed.tiers;
      overdueConfig = parsed.overdueConfig;
      upfrontFeeRate = parsed.upfrontFeeRate;
      channel = parsed.channel;
    } else {
      const settingsRows = await prisma.systemSetting.findMany();
      const sysMap: Record<string, string | number> = {};
      for (const setting of settingsRows) sysMap[setting.key] = setting.value;
      const parsed = loadFeeConfig(sysMap, null);
      tiers = parsed.tiers;
      overdueConfig = parsed.overdueConfig;
      upfrontFeeRate = parsed.upfrontFeeRate;
      channel = parsed.channel;
    }

    if (!dueDate) {
      const sortedTiers = [...tiers].sort(
        (a, b) => (a.maxHours ?? a.maxDays * 24) - (b.maxHours ?? b.maxDays * 24)
      );
      const lastTier = sortedTiers[sortedTiers.length - 1];
      dueDate = new Date(
        new Date(application.disbursement.disbursedAt).getTime() +
          (lastTier?.maxHours ?? (lastTier?.maxDays ?? 7) * 24) *
            60 *
            60 *
            1000
      );
    }

    displayOutstandingAmount = calculateRealtimeRepayment({
      principal: Number(application.amount),
      channel,
      upfrontFeeRate,
      tiers,
      overdueConfig,
      startTime: new Date(application.disbursement.disbursedAt),
      dueDate,
      currentTime: new Date(),
    }).totalRepayment;
  }

  const reminders: string[] = [];
  if (application.status === "PENDING_RISK") reminders.push("你的借款申请已提交，当前等待风控审核。");
  if (application.status === "PENDING_APPROVAL") reminders.push("你的借款申请已通过风控，当前等待审批。");
  if (application.status === "APPROVED") reminders.push("你的借款申请已审批通过，请留意合同生成和放款提醒。");
  if (application.disbursement?.status === "PAID") reminders.push("系统已显示放款成功，请尽快确认收款。");
  if (pendingReceiptRepayment) {
    reminders.push(`你提交的还款 ${pendingReceiptRepayment.repaymentNo} 正在等待后台确认到账，金额 ${money(Number(pendingReceiptRepayment.amount))}。`);
  }
  if (overdueRecord) {
    reminders.push(
      `当前已逾期 ${overdueRecord.overdueDays} 天，逾期费用 ${money(Number(overdueRecord.penaltyAmount))}，待处理总额 ${money(Number(overdueRecord.overdueAmount))}。`
    );
  } else if (nextItem && nextDueInDays !== null) {
    reminders.push(
      nextDueInDays <= 0
        ? `下一笔还款今天到期，请准备 ${money(nextDueAmount)}。`
        : `下一笔还款将在 ${nextDueInDays} 天后到期，请提前准备 ${money(nextDueAmount)}。`
    );
  }
  if (reminders.length === 0) reminders.push("当前借款流程正常，若有新节点会在这里提醒。");

  return (
    <div className="space-y-6">
      <header className="panel-soft rounded-2xl px-5 py-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">我的借款</h1>
        <p className="mt-1 text-sm text-slate-600">当前页面展示你正在处理中的借款、放款、还款与提醒信息。</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="当前状态" value={getStatusLabel(application.status)} note={application.applicationNo} />
        <SummaryCard title="借款本金" value={money(Number(application.amount))} note={application.product.name} />
        <SummaryCard title="实际到账" value={money(netAmount)} note={`放款费用 ${money(contractFee)}`} />
        <SummaryCard
          title="当前待还"
          value={plan ? money(displayOutstandingAmount) : "待生成"}
          note={nextItem ? `${formatDate(nextItem.dueDate)} · 第 ${nextItem.periodNumber} 期` : "暂无还款计划"}
        />
      </section>

      {application.status === "DISBURSED" && application.disbursement?.status === "PAID" ? (
        <RealtimeTimer applicationId={application.id} />
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="stat-tile rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-slate-900">借款概览</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <InfoRow label="借款编号" value={application.applicationNo} />
              <InfoRow label="借款产品" value={application.product.name} />
              <InfoRow label="借款金额" value={money(Number(application.amount))} />
              <InfoRow label="当前状态" value={getStatusLabel(application.status)} />
              <InfoRow label="放款状态" value={application.disbursement ? getStatusLabel(application.disbursement.status) : "待放款"} />
              <InfoRow label="放款日期" value={formatDate(application.disbursement?.disbursedAt)} />
              <InfoRow label="还款计划" value={plan ? plan.planNo : "待生成"} />
              <InfoRow label="总期数" value={plan ? `${plan.totalPeriods} 期` : "待生成"} />
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
                查看还款计划
              </Link>
              <Link
                href="/client/repayments"
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:no-underline"
              >
                申请还款
              </Link>
            </div>
          </div>

          {plan ? (
            <div className="stat-tile rounded-2xl p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">当前还款计划</h2>
                <div className="text-right text-xs text-slate-500">
                  <div>本金 {money(Number(plan.totalPrincipal))}</div>
                  <div>利息 {money(Number(plan.totalInterest))}</div>
                  <div>费用 {money(Number(plan.totalFee))}</div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {plan.scheduleItems.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">当前还没有可展示的还款计划。</div>
                ) : (
                  plan.scheduleItems.slice(0, 4).map((item) => (
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
                  ))
                )}
              </div>
            </div>
          ) : null}
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

          <div className="stat-tile rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-slate-900">借款规则说明</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                {PRODUCT_RULE_DISPLAY.UPFRONT_7D.summary}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                {PRODUCT_RULE_DISPLAY.FULL_AMOUNT_7D.summary}
              </div>
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                逾期后按日复利滚动：逾期第 1 到 7 天按 1%/天，逾期第 8 到 30 天按 2%/天，逾期第 31 天起按 3%/天；当天未付利息会并入本金继续计算。
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                {BUSINESS_LOAN_NOTICE.summary} {BUSINESS_LOAN_NOTICE.bullets.join("；")}。
              </div>
            </div>
          </div>

          <div className="stat-tile rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-slate-900">你现在可以做什么</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">在“我的还款”中直接提交还款申请，后台会收到提醒并进入处理队列。</div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">审批、放款、逾期和还款确认结果会同步出现在“消息提醒”页。</div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">如果当前借款已结清，系统会重新释放可借额度，届时可再次发起借款申请。</div>
            </div>
          </div>

          {overdueRecord ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <h2 className="text-lg font-semibold text-red-700">逾期提醒</h2>
              <div className="mt-4 space-y-2 text-sm text-red-700">
                <div>逾期天数：{overdueRecord.overdueDays} 天</div>
                <div>逾期费用：{money(Number(overdueRecord.penaltyAmount))}</div>
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
