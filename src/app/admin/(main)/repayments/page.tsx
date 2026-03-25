import dynamic from "next/dynamic";

import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { requirePermission } from "@/lib/rbac";
import { getActiveRepaymentPlans, getPendingConfirmRepayments, getRepaymentsList } from "@/lib/admin-prefetch";

const RepaymentsPageClient = dynamic(
  () => import("@/components/admin/pages/RepaymentsPageClient").then((module) => module.RepaymentsPageClient),
  {
    loading: () => <AdminPageSkeleton />,
  },
);

export default async function AdminRepaymentsPage() {
  const permission = await requirePermission(["repayment:view"]);

  if (permission instanceof Response) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <div className="panel-soft max-w-md rounded-[1.6rem] p-6 text-center">
          <h2 className="text-xl font-semibold text-slate-900">没有访问权限</h2>
          <p className="mt-2 text-sm text-slate-500">当前账号暂时无法查看还款工作台，请联系系统管理员授权。</p>
        </div>
      </div>
    );
  }

  const [plans, repayments, pendingQueue] = await Promise.all([
    getActiveRepaymentPlans(),
    getRepaymentsList({ page: 1, pageSize: 20 }),
    getPendingConfirmRepayments(),
  ]);

  return (
    <RepaymentsPageClient
      initialPlans={plans}
      initialRepayments={repayments.items}
      initialPendingQueue={pendingQueue}
    />
  );
}
