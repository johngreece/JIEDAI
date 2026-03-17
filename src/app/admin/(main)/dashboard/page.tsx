import { getAdminSession } from "@/lib/auth";
import { DashboardSummary } from "@/components/dashboard/DashboardSummary";

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

  const hour = new Date().getHours();
  let greeting = "你好";
  if (hour < 12) greeting = "早上好";
  else if (hour < 18) greeting = "下午好";
  else greeting = "晚上好";

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">工作台</h1>
          <p className="mt-2 text-sm text-slate-500">
            {greeting}，{session.username}。这里是今日的业务概览。
          </p>
        </div>
        <div className="flex gap-3">
           <button className="inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-slate-200 bg-white hover:bg-slate-100 h-9 px-4 py-2">
             导出报表
           </button>
           <button className="inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-blue-600 text-white hover:bg-blue-700 h-9 px-4 py-2 shadow-sm">
             新增客户
           </button>
        </div>
      </header>
      
      <section aria-label="数据概览" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <DashboardSummary />
      </section>
    </div>
  );
}
