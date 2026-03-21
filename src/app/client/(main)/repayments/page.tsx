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

export default async function ClientRepaymentsPage() {
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
          <h1 className="text-2xl font-bold text-slate-900">我的还款</h1>
          <p className="mt-1 text-sm text-slate-600">这里只展示当前借款，不展示历史还款。</p>
        </header>
        <div className="panel-soft rounded-2xl p-6 text-sm text-slate-500">
          当前没有需要处理的借款还款。
        </div>
      </div>
    );
  }

  const plan = await prisma.repaymentPlan.findFirst({
    where: { applicationId: application.id, status: "ACTIVE" },
    select: { id: true },
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
          receivedAt: true,
          principalPart: true,
          interestPart: true,
          feePart: true,
          penaltyPart: true,
        },
      })
    : [];

  const waitingForCustomer = repayments.filter((item) => item.status === "PENDING_CONFIRM");
  const waitingForReceipt = repayments.filter((item) => item.status === "CUSTOMER_CONFIRMED");

  return (
    <div className="space-y-6">
      <header className="panel-soft rounded-2xl px-5 py-4">
        <h1 className="text-2xl font-bold text-slate-900">我的还款</h1>
        <p className="mt-1 text-sm text-slate-600">
          当前只展示借款 {application.applicationNo} 的还款处理，不显示历史借款记录。
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard title="当前借款" value={application.applicationNo} note={application.product.name} />
        <StatCard title="待我确认付款" value={`${waitingForCustomer.length} 笔`} note="需要你签字确认的当前还款" />
        <StatCard title="待后台收款确认" value={`${waitingForReceipt.length} 笔`} note="你已报备付款，等待后台确认到账" />
      </section>

      {waitingForReceipt.length > 0 ? (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <h2 className="text-lg font-semibold text-slate-900">已报备付款</h2>
          <p className="mt-2 text-sm text-slate-600">
            你今天确认付款后，系统会默认先停止当日计息，直到管理端确认到账。
            如果后台标记未收款，本金会恢复按原规则继续计息。
          </p>
        </section>
      ) : null}

      <section className="table-shell overflow-hidden rounded-xl">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-900">优先处理</h2>
        </div>
        {waitingForCustomer.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500">当前没有待你确认付款的还款。</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {waitingForCustomer.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
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
        )}
      </section>

      <section className="table-shell overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left">还款单号</th>
                <th className="px-4 py-3 text-left">金额</th>
                <th className="px-4 py-3 text-left">分配结构</th>
                <th className="px-4 py-3 text-left">状态</th>
                <th className="px-4 py-3 text-left">收款时间</th>
                <th className="px-4 py-3 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {repayments.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={6}>
                    当前借款还没有还款记录。
                  </td>
                </tr>
              ) : (
                repayments.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{item.repaymentNo}</td>
                    <td className="px-4 py-3">{money(Number(item.amount))}</td>
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
                      {item.receivedAt ? new Date(item.receivedAt).toLocaleString("zh-CN") : "-"}
                    </td>
                    <td className="px-4 py-3">
                      {item.status === "PENDING_CONFIRM" ? (
                        <Link href={`/client/sign/repayment/${item.id}`} className="text-blue-600 hover:underline">
                          确认付款
                        </Link>
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
