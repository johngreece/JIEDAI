import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardSummary } from "@/components/dashboard/DashboardSummary";
import { getAdminSession } from "@/lib/auth";

export default async function AdminDashboardPage() {
  const session = await getAdminSession();

  if (!session) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <div className="panel-soft max-w-md rounded-2xl p-6 text-center">
          <h2 className="text-xl font-semibold text-slate-900">需要先登录后台</h2>
          <p className="mt-2 text-sm text-slate-500">
            登录后即可查看智能预警、资金分析和客户洞察。
          </p>
          <a
            href="/admin/login"
            className="mt-5 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            前往登录
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 2xl:space-y-6">
      <DashboardHeader username={session.username} />
      <section aria-label="智能数据概览" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <DashboardSummary />
      </section>
    </div>
  );
}
