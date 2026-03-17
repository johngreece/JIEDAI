import { getAdminSession } from "@/lib/auth";
import { DashboardSummary } from "@/components/dashboard/DashboardSummary";

export default async function AdminDashboardPage() {
  const session = await getAdminSession();

  if (!session) {
    return (
      <div className="p-6">
        <p className="text-slate-600">请先<a href="/admin/login" className="text-blue-600 hover:underline">登录</a></p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <header className="mb-8">
        <h1 className="text-xl font-semibold">工作台</h1>
        <p className="text-sm text-slate-500 mt-1">欢迎, {session.username}</p>
      </header>
      <section aria-label="数据概览">
        <DashboardSummary />
      </section>
    </div>
  );
}
