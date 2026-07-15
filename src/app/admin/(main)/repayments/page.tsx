import dynamic from "next/dynamic";

import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
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
    return <AdminAccessDenied />;
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
