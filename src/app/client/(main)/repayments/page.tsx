import Link from "next/link";
import { getActiveClientSession } from "@/lib/portal-session";
import { prisma } from "@/lib/prisma";
import { getStatusBadgeClass, getStatusLabel } from "@/lib/status-ui";
import { RepaymentRequestForm } from "@/components/client/RepaymentRequestForm";
import RealtimeTimer from "@/components/RealtimeTimer";
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
import { applyCustomerPricingOverride } from "@/lib/customer-pricing";
import { getFrozenPayableAmount, hasExplicitInterestFreeze } from "@/lib/repayment-runtime";
import { formatMoney as money } from "@/lib/system-config";

function formatDateTime(value: Date | string) {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default async function ClientRepaymentsPage() {
  const session = await getActiveClientSession();

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
      select: {
        id: true,
        applicationNo: true,
        amount: true,
        customer: {
          select: { weeklyInterestRateOverride: true },
        },
        product: {
          select: {
            name: true,
            pricingRules: {
              where: { isActive: true },
              orderBy: { priority: "desc" },
            },
          },
        },
        disbursement: {
          select: {
            status: true,
            disbursedAt: true,
            netAmount: true,
          },
        },
      },
    });

  if (!application) {
    return (
      <div className="space-y-6">
        <header className="panel-soft rounded-2xl px-5 py-4">
          <h1 className="text-2xl font-bold text-slate-900">我的还款</h1>
          <p className="mt-1 text-sm text-slate-600">当前没有进行中的借款，所以暂时没有可申请的还款。</p>
        </header>
        <div className="panel-soft rounded-2xl p-6 text-sm text-slate-500">
          你可以先到“我的借款”申请借款，放款并生成还款计划后，就能在这里发起还款申请。
        </div>
      </div>
    );
  }

  const plan = await prisma.repaymentPlan.findFirst({
    where: { applicationId: application.id, status: "ACTIVE" },
    select: {
      id: true,
      totalPrincipal: true,
      rulesSnapshotJson: true,
      scheduleItems: {
        where: {
          status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
        },
        orderBy: { dueDate: "asc" },
        select: {
          id: true,
          remaining: true,
          dueDate: true,
          periodNumber: true,
          status: true,
        },
      },
    },
  });

  const repayments = plan
    ? await prisma.repayment.findMany({
        where: { planId: plan.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          repaymentNo: true,
          amount: true,
          status: true,
          paymentMethod: true,
          receivedAt: true,
          interestFrozenAt: true,
          frozenPayableAmount: true,
          principalPart: true,
          interestPart: true,
          feePart: true,
          penaltyPart: true,
          remark: true,
          matchComment: true,
          createdAt: true,
          confirmation: {
            select: { rejectReason: true },
          },
        },
      })
    : [];

  const waitingForCustomer = repayments.filter((item) => item.status === "PENDING_CONFIRM");
  const waitingForReceipt = repayments.filter((item) => item.status === "CUSTOMER_CONFIRMED");
  const waitingForAdminReview = repayments.filter((item) => item.status === "MANUAL_REVIEW");
  const rejectedRepayments = repayments.filter((item) => item.status === "REJECTED");
  const activeInterestFreeze =
    repayments.find((item) => hasExplicitInterestFreeze(item)) ?? null;
  let outstandingAmount = plan
    ? plan.scheduleItems.reduce((sum, item) => sum + Number(item.remaining), 0)
    : 0;
  if (plan && application.disbursement?.status === "PAID" && application.disbursement.disbursedAt) {
    let tiers: RepaymentTier[] = DEFAULT_TIERS;
    let overdueConfig: OverdueConfig = DEFAULT_OVERDUE;
    let upfrontFeeRate = DEFAULT_UPFRONT_FEE_RATE;
    let channel: ChannelType = "FULL_AMOUNT";
    let dueDate: Date | null = null;
    let normalInterestCapitalized = false;
    let fixedFeeAmount = 0;
    let netDisbursementAmount: number | undefined;

    if (plan.rulesSnapshotJson) {
      try {
        const snapshot = JSON.parse(plan.rulesSnapshotJson) as {
          tiers?: RepaymentTier[];
          overdueConfig?: OverdueConfig;
          upfrontFeeRate?: number;
          channel?: ChannelType;
          dueDate?: string;
          normalInterestCapitalized?: boolean;
          fixedFeeAmount?: number;
          netDisbursementAmount?: number;
        };
        if (snapshot.tiers) tiers = snapshot.tiers;
        if (snapshot.overdueConfig) overdueConfig = snapshot.overdueConfig;
        if (snapshot.upfrontFeeRate != null) upfrontFeeRate = snapshot.upfrontFeeRate;
        if (snapshot.channel) channel = snapshot.channel;
        if (snapshot.dueDate) dueDate = new Date(snapshot.dueDate);
        if (snapshot.normalInterestCapitalized != null) {
          normalInterestCapitalized = snapshot.normalInterestCapitalized;
        }
        if (snapshot.fixedFeeAmount != null) fixedFeeAmount = snapshot.fixedFeeAmount;
        if (snapshot.netDisbursementAmount != null) {
          netDisbursementAmount = snapshot.netDisbursementAmount;
        }
      } catch {
        // ignore invalid snapshot
      }
    } else if (application.product.pricingRules.length > 0) {
      const parsed = parseTiersFromPricingRules(application.product.pricingRules);
      const effective = applyCustomerPricingOverride(parsed, application.customer);
      tiers = effective.tiers;
      overdueConfig = effective.overdueConfig;
      upfrontFeeRate = effective.upfrontFeeRate;
      channel = effective.channel;
    } else {
      const settingsRows = await prisma.systemSetting.findMany();
      const sysMap: Record<string, string | number> = {};
      for (const setting of settingsRows) sysMap[setting.key] = setting.value;
      const parsed = loadFeeConfig(sysMap, null);
      const effective = applyCustomerPricingOverride(parsed, application.customer);
      tiers = effective.tiers;
      overdueConfig = effective.overdueConfig;
      upfrontFeeRate = effective.upfrontFeeRate;
      channel = effective.channel;
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

    outstandingAmount = calculateRealtimeRepayment({
      principal: Number(plan.totalPrincipal),
      channel,
      upfrontFeeRate,
      tiers,
      overdueConfig,
      startTime: new Date(application.disbursement.disbursedAt),
      dueDate,
      currentTime: new Date(),
      normalInterestCapitalized,
      fixedFeeAmount,
      netDisbursementAmount:
        netDisbursementAmount ?? Number(application.disbursement.netAmount),
    }).totalRepayment;
  }
  if (activeInterestFreeze) {
    outstandingAmount = getFrozenPayableAmount(activeInterestFreeze) ?? outstandingAmount;
  }
  const blocked = waitingForAdminReview.length > 0 || waitingForCustomer.length > 0 || waitingForReceipt.length > 0;
  const blockedReason = waitingForAdminReview.length > 0
    ? "你已有待后台处理的还款申请，请等待管理端先完成分配。"
    : waitingForCustomer.length > 0
      ? "你已有待确认付款的还款单，请先完成客户确认。"
      : waitingForReceipt.length > 0
        ? "你已有待后台确认到账的还款单，请等待处理结果。"
        : null;

  return (
    <div className="space-y-6">
      <header className="panel-soft rounded-2xl px-5 py-4">
        <h1 className="text-2xl font-bold text-slate-900">我的还款</h1>
        <p className="mt-1 text-sm text-slate-600">当前页面支持你直接发起还款申请，并跟踪后台分配、确认到账的处理状态。</p>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard title="当前借款" value={application.applicationNo} note={application.product.name} />
        <StatCard
          title={activeInterestFreeze ? "已锁定应还" : "当前待还"}
          value={plan ? money(outstandingAmount) : "待生成"}
          note={
            activeInterestFreeze
              ? "客户已提交还款，新增利息暂停"
              : plan
                ? `${plan.scheduleItems.length} 个待处理账期`
                : "暂无可用计划"
          }
        />
        <StatCard title="待后台分配" value={`${waitingForAdminReview.length} 笔`} note="客户已提交申请，等待管理端处理" />
        <StatCard title="待到账确认" value={`${waitingForReceipt.length} 笔`} note="客户已报备付款，等待管理端确认到账" />
      </section>

      {application.disbursement?.status === "PAID" && application.disbursement.disbursedAt ? (
        <RealtimeTimer applicationId={application.id} />
      ) : null}

      {plan ? (
        <RepaymentRequestForm
          outstandingAmount={outstandingAmount}
          blocked={blocked}
          blockedReason={blockedReason}
        />
      ) : (
        <div className="stat-tile rounded-2xl p-5 text-sm text-slate-500">
          当前借款还没有生成还款计划，暂时不能提交还款申请。
        </div>
      )}

      {waitingForCustomer.length > 0 ? (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <h2 className="text-lg font-semibold text-slate-900">待你确认付款</h2>
          <div className="mt-3 space-y-3">
            {waitingForCustomer.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{item.repaymentNo}</p>
                  <p className="mt-1 text-xs text-slate-500">{money(Number(item.amount))}</p>
                </div>
                <Link
                  href={`/client/sign/repayment/${item.id}`}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 hover:no-underline"
                >
                  去确认付款
                </Link>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {rejectedRepayments.length > 0 ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <h2 className="text-lg font-semibold text-slate-900">被驳回的还款申请</h2>
          <p className="mt-1 text-xs text-slate-600">管理端核对后未匹配到以下款项，本金将按原规则继续计息。如有异议可联系业务员复核，或重新发起新一次还款申请。</p>
          <div className="mt-3 space-y-3">
            {rejectedRepayments.map((item) => (
              <div key={item.id} className="rounded-xl border border-red-100 bg-white px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{item.repaymentNo}</p>
                    <p className="mt-1 text-xs text-slate-500">{money(Number(item.amount))} · {new Date(item.createdAt).toLocaleString("zh-CN")}</p>
                  </div>
                  <Link
                    href={`/client/sign/repayment/${item.id}`}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 hover:no-underline"
                  >
                    查看驳回详情
                  </Link>
                </div>
                {item.confirmation?.rejectReason || item.matchComment ? (
                  <p className="mt-2 whitespace-pre-line text-xs text-slate-600">
                    驳回原因：{item.confirmation?.rejectReason || item.matchComment}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {plan ? (
        <section className="table-shell overflow-hidden rounded-xl">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="font-semibold text-slate-900">当前待还账期</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {plan.scheduleItems.length === 0 ? (
              <div className="px-4 py-6 text-sm text-slate-500">当前没有待处理账期。</div>
            ) : (
              plan.scheduleItems.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">第 {item.periodNumber} 期</p>
                    <p className="mt-1 text-xs text-slate-500">
                      到期时间 {formatDateTime(item.dueDate)} · {getStatusLabel(item.status)}
                    </p>
                  </div>
                  <div className="text-sm font-semibold text-slate-900">{money(Number(item.remaining))}</div>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      <section className="table-shell overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left">还款单号</th>
                <th className="px-4 py-3 text-left">金额</th>
                <th className="px-4 py-3 text-left">支付方式</th>
                <th className="px-4 py-3 text-left">分配结构</th>
                <th className="px-4 py-3 text-left">状态</th>
                <th className="px-4 py-3 text-left">时间</th>
                <th className="px-4 py-3 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {repayments.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={7}>
                    当前还没有还款记录。
                  </td>
                </tr>
              ) : (
                repayments.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{item.repaymentNo}</td>
                    <td className="px-4 py-3">
                      <div>{money(Number(item.amount))}</div>
                      {item.frozenPayableAmount ? (
                        <div className="mt-1 text-xs text-emerald-600">
                          锁定 {money(Number(item.frozenPayableAmount))}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{item.paymentMethod}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      <div>本金 {money(Number(item.principalPart))}</div>
                      <div>利息 {money(Number(item.interestPart))}</div>
                      <div>费用 {money(Number(item.feePart) + Number(item.penaltyPart))}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${getStatusBadgeClass(item.status)}`}>
                        {getStatusLabel(item.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      <div>{new Date(item.createdAt).toLocaleString("zh-CN")}</div>
                      {item.interestFrozenAt ? (
                        <div className="mt-1 text-xs text-emerald-600">
                          计息暂停 {new Date(item.interestFrozenAt).toLocaleString("zh-CN")}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {item.status === "PENDING_CONFIRM" ? (
                        <Link href={`/client/sign/repayment/${item.id}`} className="text-blue-600 hover:underline">
                          确认付款
                        </Link>
                      ) : item.status === "MANUAL_REVIEW" ? (
                        <span className="text-amber-600">等待后台分配</span>
                      ) : item.status === "CUSTOMER_CONFIRMED" ? (
                        <span className="text-blue-600">等待后台确认到账</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <div className="stat-tile rounded-xl p-4">
      <p className="text-xs text-slate-500">{title}</p>
      <p className="mt-2 text-xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </div>
  );
}
