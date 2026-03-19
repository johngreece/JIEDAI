import { getAdminSession } from "@/lib/auth";
import { DashboardSummary } from "@/components/dashboard/DashboardSummary";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";

export default async function AdminDashboardPage() {
  const session = await getAdminSession();

  if (!session) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <h3 className="mt-2 text-sm font-semibold text-slate-900">未登录</h3>
          <p className="mt-1 text-sm text-slate-500">请先登录以查看工作台信息。</p>
          <div className="mt-6">
            <a href="/admin/login" className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
              去登录
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardHeader username={session.username} />
      
      <section aria-label="数据概览" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <DashboardSummary />
      </section>
    </div>
  );
}
