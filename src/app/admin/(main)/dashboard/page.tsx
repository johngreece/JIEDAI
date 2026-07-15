import dynamic from "next/dynamic";

import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { getDashboardSummaryData, getSmartDashboardData } from "@/lib/dashboard-data";
import { requirePermission } from "@/lib/rbac";

const DashboardSummary = dynamic(
  () => import("@/components/dashboard/DashboardSummary").then((module) => module.DashboardSummary),
  {
    loading: () => <AdminPageSkeleton mode="dashboard" />,
  },
);

export default async function AdminDashboardPage() {
  const session = await requirePermission(["dashboard:view"]);

  if (session instanceof Response) {
    return <AdminAccessDenied />;
  }

  const [summaryResult, smartResult] = await Promise.allSettled([
    getDashboardSummaryData(),
    getSmartDashboardData(),
  ]);

  const initialSummary = summaryResult.status === "fulfilled" ? summaryResult.value : null;
  const initialSmart = smartResult.status === "fulfilled" ? smartResult.value : null;

  return (
    <div className="space-y-5 2xl:space-y-6">
      <DashboardHeader username={session.username} />
      <section aria-label="智能数据总览" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <DashboardSummary
          initialSummary={initialSummary}
          initialSmart={initialSmart}
          initialLoadedAt={new Date().toISOString()}
        />
      </section>
    </div>
  );
}
