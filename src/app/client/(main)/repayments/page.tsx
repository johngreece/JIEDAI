import Link from "next/link";
import { getClientSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type AppLite = { id: string; applicationNo: string; product: { name: string } };
type PlanLite = { id: string; applicationId: string };
type RepaymentLite = {
  id: string;
  repaymentNo: string;
  amount: unknown;
  status: string;
  receivedAt: Date | null;
  plan: { id: string; applicationId: string };
};

export default async function ClientRepaymentsPage() {
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
  const appIds = (applications as AppLite[]).map((x: AppLite) => x.id);
  const appMap = new Map((applications as AppLite[]).map((x: AppLite) => [x.id, x]));

  const plans = appIds.length
    ? await prisma.repaymentPlan.findMany({
        where: { applicationId: { in: appIds } },
        select: { id: true, applicationId: true },
      })
    : [];
  const planIds = (plans as PlanLite[]).map((x: PlanLite) => x.id);
  const planMap = new Map((plans as PlanLite[]).map((x: PlanLite) => [x.id, x]));

  const repayments = planIds.length
    ? await prisma.repayment.findMany({
        where: { planId: { in: planIds } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          repaymentNo: true,
          amount: true,
          status: true,
          receivedAt: true,
          plan: { select: { id: true, applicationId: true } },
        },
      })
    : [];

  const typedRepayments = repayments as RepaymentLite[];
  const pending = typedRepayments
    .filter((x: RepaymentLite) => x.status === "PENDING_CONFIRM")
    .map((x: RepaymentLite) => {
      const application = appMap.get(planMap.get(x.plan.id)?.applicationId ?? "") ?? null;
      return {
        id: x.id,
        repaymentNo: x.repaymentNo,
        amount: Number(x.amount),
        application,
      };
    });

  const statusText: Record<string, string> = {
    PENDING: "待处理",
    MATCHED: "已匹配",
    PENDING_CONFIRM: "待我确认",
    CONFIRMED: "已确认",
    REJECTED: "已驳回",
    MANUAL_REVIEW: "人工复核",
  };

  return (
    <div className="space-y-6">
      <header className="panel-soft rounded-2xl px-5 py-4">
        <h1 className="text-2xl font-bold text-slate-900">我的还款</h1>
        <p className="mt-1 text-sm text-slate-600">待确认还款与历史记录</p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-tile rounded-xl p-4"><p className="text-xs text-slate-500">总还款单</p><p className="text-xl font-semibold">{repayments.length}</p></div>
        <div className="stat-tile rounded-xl p-4"><p className="text-xs text-slate-500">待我确认</p><p className="text-xl font-semibold text-amber-600">{pending.length}</p></div>
        <div className="stat-tile rounded-xl p-4"><p className="text-xs text-slate-500">已确认</p><p className="text-xl font-semibold text-emerald-600">{typedRepayments.filter((x: RepaymentLite) => x.status === "CONFIRMED").length}</p></div>
        <div className="stat-tile rounded-xl p-4"><p className="text-xs text-slate-500">争议/复核</p><p className="text-xl font-semibold text-red-600">{typedRepayments.filter((x: RepaymentLite) => x.status === "REJECTED" || x.status === "MANUAL_REVIEW").length}</p></div>
      </section>

      <section className="table-shell overflow-hidden rounded-xl">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">待确认优先处理</h2>
        </div>
        {pending.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500">当前没有待确认还款。</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pending.map((x) => (
              <div key={x.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">{x.repaymentNo} · ¥ {Number(x.amount).toFixed(2)}</p>
                  <p className="text-xs text-slate-500 mt-1">申请 {x.application?.applicationNo ?? "-"} · {x.application?.product.name ?? "-"}</p>
                </div>
                <Link href={`/client/sign/repayment/${x.id}`} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">去确认</Link>
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
                <th className="text-left px-4 py-3">还款单号</th>
                <th className="text-left px-4 py-3">申请/产品</th>
                <th className="text-left px-4 py-3">金额</th>
                <th className="text-left px-4 py-3">状态</th>
                <th className="text-left px-4 py-3">收款时间</th>
                <th className="text-left px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {repayments.length === 0 ? (
                <tr><td className="px-4 py-6 text-slate-500" colSpan={6}>暂无还款记录</td></tr>
              ) : typedRepayments.map((x: RepaymentLite) => (
                <tr key={x.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">{x.repaymentNo}</td>
                  <td className="px-4 py-3">{appMap.get(planMap.get(x.plan.id)?.applicationId ?? "")?.applicationNo ?? "-"}<div className="text-xs text-slate-500">{appMap.get(planMap.get(x.plan.id)?.applicationId ?? "")?.product.name ?? "-"}</div></td>
                  <td className="px-4 py-3">¥ {Number(x.amount).toFixed(2)}</td>
                  <td className="px-4 py-3">{statusText[x.status] ?? x.status}</td>
                  <td className="px-4 py-3">{x.receivedAt ? new Date(x.receivedAt).toLocaleString() : "-"}</td>
                  <td className="px-4 py-3">
                    {x.status === "PENDING_CONFIRM" ? (
                      <Link href={`/client/sign/repayment/${x.id}`} className="text-blue-600 hover:underline">确认</Link>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
