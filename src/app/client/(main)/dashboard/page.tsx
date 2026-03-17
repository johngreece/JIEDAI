import { getClientSession } from "@/lib/auth";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ConfirmReceivedButton } from "@/components/client/ConfirmReceivedButton";

export default async function ClientDashboardPage() {
  const session = await getClientSession();

  if (!session) {
    return (
      <div className="flex h-96 flex-col items-center justify-center space-y-4">
        <p className="text-slate-500">登录已过期，请重新登录</p>
        <Link 
          href="/client/login" 
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          重新登录
        </Link>
      </div>
    );
  }

  // Icons replacement since we can't import heroicons directly without installing
  const IconMoney = () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
  const IconDoc = () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
  const IconClock = () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  const applications = await prisma.loanApplication.findMany({
    where: { customerId: session.sub, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      product: { select: { id: true, name: true } },
      contracts: { select: { id: true, status: true }, orderBy: { createdAt: "desc" }, take: 1 },
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
    take: 20,
  });

  const appIds = applications.map((x) => x.id);
  const plans = appIds.length
    ? await prisma.repaymentPlan.findMany({
        where: { applicationId: { in: appIds }, status: "ACTIVE" },
        select: {
          id: true,
          applicationId: true,
          planNo: true,
          totalPrincipal: true,
          totalInterest: true,
          totalFee: true,
          totalPeriods: true,
          scheduleItems: {
            orderBy: { dueDate: "asc" },
            select: {
              id: true,
              dueDate: true,
              totalDue: true,
              remaining: true,
              status: true,
              periodNumber: true,
            },
          },
        },
      })
    : [];

  const pendingReceive = applications.filter((x) => x.disbursement?.status === "PAID");
  const disbursedTotal = applications.reduce((acc, x) => {
    if (!x.disbursement) return acc;
    return acc + Number(x.disbursement.netAmount);
  }, 0);

  const nearestItem = plans
    .flatMap((p) => p.scheduleItems)
    .filter((x) => x.status === "PENDING")
    .sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate))[0];

  const nearestDueAmount = nearestItem ? Number(nearestItem.remaining || nearestItem.totalDue) : 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">我的借款</h1>
        <p className="mt-1 text-sm text-slate-500">欢迎回来，{session.name}。</p>
      </header>

      {/* 状态卡片 */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Loan Status Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between h-40 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <IconMoney />
          </div>
          <div>
            <h3 className="font-medium text-slate-500 text-sm">当前借款状态</h3>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900">{applications.length > 0 ? `${applications.length} 笔` : "无借款"}</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">累计实收 ¥ {disbursedTotal.toFixed(2)}</p>
          </div>
          <div className="mt-4">
             <Link href="/client/dashboard" className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline">
               刷新数据 &rarr;
             </Link>
          </div>
        </div>

        {/* Repayment Status Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between h-40">
           <div>
            <h3 className="font-medium text-slate-500 text-sm">本期应还</h3>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900">¥ {nearestDueAmount.toFixed(2)}</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">{nearestItem ? `第 ${nearestItem.periodNumber} 期 · 到期 ${new Date(nearestItem.dueDate).toLocaleDateString()}` : "暂无需还款项"}</p>
          </div>
          <div className="mt-4">
            <Link href="/client/repayments" className="text-sm font-medium text-blue-600 hover:underline">去确认还款</Link>
          </div>
        </div>

        {/* Action Card */}
         <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6 shadow-sm flex flex-col justify-center items-center text-center h-40">
            <div className="mb-3 h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
               <IconDoc />
            </div>
            <h3 className="font-semibold text-slate-900">申请借款</h3>
            <p className="text-xs text-slate-500 mt-1 mb-3">待确认收款 {pendingReceive.length} 笔</p>
         </div>
      </div>

      {/* Recent Activity List */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
           <h3 className="font-semibold text-slate-900">最近动态</h3>
           <span className="text-sm text-slate-500">共 {applications.length} 条借款记录</span>
        </div>
        <div className="divide-y divide-slate-100">
          {applications.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-sm py-12">
              <div className="bg-slate-50 rounded-full h-12 w-12 flex items-center justify-center mx-auto mb-3">
                <IconClock />
              </div>
              暂无借款记录
            </div>
          ) : (
            applications.map((x) => (
              <div key={x.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{x.applicationNo} · {x.product.name}</p>
                  <p className="text-xs text-slate-500 mt-1">申请金额 ¥ {Number(x.amount).toFixed(2)} · 状态 {x.status}</p>
                  {x.disbursement ? (
                    <p className="text-xs text-slate-500 mt-1">放款单 {x.disbursement.disbursementNo} · {x.disbursement.status} · 净额 ¥ {Number(x.disbursement.netAmount).toFixed(2)}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {x.disbursement?.status === "PAID" ? (
                    <ConfirmReceivedButton disbursementId={x.disbursement.id} />
                  ) : null}
                  {x.contracts[0]?.id ? (
                    <Link href={`/client/sign/contract/${x.contracts[0].id}`} className="text-xs text-blue-600 hover:underline">查看合同</Link>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
