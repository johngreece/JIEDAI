import Link from "next/link";
import { getClientSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStatusBadgeClass, getStatusLabel } from "@/lib/status-ui";

function money(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default async function ClientRepaymentPlansPage() {
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
    select: {
      id: true,
      applicationNo: true,
      product: { select: { name: true } },
    },
  });

  if (!application) {
    return (
      <div className="space-y-6">
        <header className="panel-soft rounded-2xl px-5 py-4">
          <h1 className="text-2xl font-bold text-slate-900">还款计划</h1>
          <p className="mt-1 text-sm text-slate-600">当前仅展示有效借款的计划，不提供历史借款计划查看。</p>
        </header>
        <div className="panel-soft rounded-xl p-6 text-sm text-slate-500">当前没有进行中的还款计划。</div>
      </div>
    );
  }

  const plan = await prisma.repaymentPlan.findFirst({
    where: { applicationId: application.id, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    include: {
      scheduleItems: {
        orderBy: { periodNumber: "asc" },
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

  return (
    <div className="space-y-6">
      <header className="panel-soft rounded-2xl px-5 py-4">
        <h1 className="text-2xl font-bold text-slate-900">还款计划</h1>
        <p className="mt-1 text-sm text-slate-600">
          当前只展示借款 {application.applicationNo} 的计划明细，不显示历史借款计划。
        </p>
      </header>

      {!plan ? (
        <div className="panel-soft rounded-xl p-6 text-sm text-slate-500">当前借款的还款计划还未生成。</div>
      ) : (
        <section className="table-shell overflow-hidden rounded-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{plan.planNo}</p>
              <p className="mt-1 text-xs text-slate-500">{application.product.name}</p>
              <div className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs ${getStatusBadgeClass(plan.status)}`}>
                {getStatusLabel(plan.status)}
              </div>
            </div>
            <div className="text-right text-sm text-slate-600">
              <div>本金 {money(Number(plan.totalPrincipal))}</div>
              <div>利息 {money(Number(plan.totalInterest))}</div>
              <div>费用 {money(Number(plan.totalFee))}</div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-2 text-left">期次</th>
                  <th className="px-4 py-2 text-left">到期日</th>
                  <th className="px-4 py-2 text-left">本金</th>
                  <th className="px-4 py-2 text-left">利息</th>
                  <th className="px-4 py-2 text-left">费用</th>
                  <th className="px-4 py-2 text-left">应还</th>
                  <th className="px-4 py-2 text-left">剩余</th>
                  <th className="px-4 py-2 text-left">状态</th>
                </tr>
              </thead>
              <tbody>
                {plan.scheduleItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-slate-500">
                      当前计划还没有期次数据。
                    </td>
                  </tr>
                ) : (
                  plan.scheduleItems.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-4 py-2">第 {item.periodNumber} 期</td>
                      <td className="px-4 py-2">{new Date(item.dueDate).toLocaleDateString("zh-CN")}</td>
                      <td className="px-4 py-2">{money(Number(item.principal))}</td>
                      <td className="px-4 py-2">{money(Number(item.interest))}</td>
                      <td className="px-4 py-2">{money(Number(item.fee))}</td>
                      <td className="px-4 py-2">{money(Number(item.totalDue))}</td>
                      <td className="px-4 py-2">{money(Number(item.remaining))}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${getStatusBadgeClass(item.status)}`}>
                          {getStatusLabel(item.status)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
