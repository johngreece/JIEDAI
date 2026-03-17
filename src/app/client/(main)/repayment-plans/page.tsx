import Link from "next/link";
import { getClientSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type AppLite = { id: string; applicationNo: string; product: { name: string } };
type ItemLite = {
  id: string;
  periodNumber: number;
  dueDate: Date;
  principal: unknown;
  interest: unknown;
  fee: unknown;
  totalDue: unknown;
  remaining: unknown;
  status: string;
};
type PlanLite = {
  id: string;
  planNo: string;
  applicationId: string;
  totalPrincipal: unknown;
  totalInterest: unknown;
  totalFee: unknown;
  totalPeriods: number;
  status: string;
  scheduleItems: ItemLite[];
};

export default async function ClientRepaymentPlansPage() {
  const session = await getClientSession();

  if (!session) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <p className="text-slate-500">登录已过期，请重新登录</p>
        <Link href="/client/login" className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
          重新登录
        </Link>
      </div>
    );
  }

  const applications = await prisma.loanApplication.findMany({
    where: { customerId: session.sub, deletedAt: null },
    select: { id: true, applicationNo: true, product: { select: { name: true } } },
  });

  const appMap = new Map((applications as AppLite[]).map((x: AppLite) => [x.id, x]));

  const plans = await prisma.repaymentPlan.findMany({
    where: { applicationId: { in: (applications as AppLite[]).map((x: AppLite) => x.id) } },
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
      <header>
        <h1 className="text-2xl font-bold text-slate-900">还款计划</h1>
        <p className="mt-1 text-sm text-slate-500">查看每笔借款的分期与到期安排</p>
      </header>

      {plans.length === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-sm text-slate-500">暂无还款计划。</div>
      ) : (
        <div className="space-y-4">
          {(plans as PlanLite[]).map((p: PlanLite) => {
            const app = appMap.get(p.applicationId);
            return (
              <section key={p.id} className="rounded-xl border bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{p.planNo} · {app?.applicationNo ?? p.applicationId}</p>
                    <p className="text-xs text-slate-500 mt-1">{app?.product.name ?? "-"} · 状态 {p.status} · 共 {p.totalPeriods} 期</p>
                  </div>
                  <div className="text-right text-xs text-slate-600">
                    <div>本金 ¥ {Number(p.totalPrincipal).toFixed(2)}</div>
                    <div>利息 ¥ {Number(p.totalInterest).toFixed(2)} · 费用 ¥ {Number(p.totalFee).toFixed(2)}</div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="text-left px-4 py-2">期次</th>
                        <th className="text-left px-4 py-2">到期日</th>
                        <th className="text-left px-4 py-2">本金</th>
                        <th className="text-left px-4 py-2">利息</th>
                        <th className="text-left px-4 py-2">费用</th>
                        <th className="text-left px-4 py-2">应还</th>
                        <th className="text-left px-4 py-2">剩余</th>
                        <th className="text-left px-4 py-2">状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.scheduleItems.length === 0 ? (
                        <tr><td colSpan={8} className="px-4 py-4 text-slate-500">暂无期次明细</td></tr>
                      ) : p.scheduleItems.map((x: ItemLite) => (
                        <tr key={x.id} className="border-t border-slate-100">
                          <td className="px-4 py-2">第 {x.periodNumber} 期</td>
                          <td className="px-4 py-2">{new Date(x.dueDate).toLocaleDateString()}</td>
                          <td className="px-4 py-2">¥ {Number(x.principal).toFixed(2)}</td>
                          <td className="px-4 py-2">¥ {Number(x.interest).toFixed(2)}</td>
                          <td className="px-4 py-2">¥ {Number(x.fee).toFixed(2)}</td>
                          <td className="px-4 py-2">¥ {Number(x.totalDue).toFixed(2)}</td>
                          <td className="px-4 py-2">¥ {Number(x.remaining).toFixed(2)}</td>
                          <td className="px-4 py-2">{x.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
