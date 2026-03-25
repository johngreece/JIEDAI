import dynamic from "next/dynamic";

import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { getAdminSession } from "@/lib/auth";
import { getDashboardSummaryData, getSmartDashboardData } from "@/lib/dashboard-data";

const DashboardSummary = dynamic(
  () => import("@/components/dashboard/DashboardSummary").then((module) => module.DashboardSummary),
  {
    loading: () => <AdminPageSkeleton mode="dashboard" />,
  },
);

export default async function AdminDashboardPage() {
  const session = await getAdminSession();

  if (!session) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <div className="panel-soft max-w-md rounded-[1.6rem] p-6 text-center">
          <h2 className="text-xl font-semibold text-slate-900">需要先登录后台</h2>
          <p className="mt-2 text-sm text-slate-500">
            登录后即可查看智能预警、资金分析和客户洞察。
          </p>
          <a href="/admin/login" className="admin-btn admin-btn-primary mt-5 inline-flex">
            前往登录
          </a>
        </div>
      </div>
    );
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
