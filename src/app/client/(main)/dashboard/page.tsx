import { getClientSession } from "@/lib/auth";
import Link from "next/link";

export default async function ClientDashboardPage() {
  const session = await getClientSession();

  if (!session) {
    return (
      <div className="flex h-96 flex-col items-center justify-center space-y-4">
        <p className="text-slate-500">登录已过期，请重新登录</p>
        <Link 
          href="/client/login" 
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          重新登录
        </Link>
      </div>
    );
  }

  // Icons replacement since we can't import heroicons directly without installing
  const IconMoney = () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
  const IconDoc = () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
  const IconClock = () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">我的借款</h1>
        <p className="mt-1 text-sm text-slate-500">欢迎回来，{session.name}。</p>
      </header>

      {/* 状态卡片 */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Loan Status Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between h-40 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <IconMoney />
          </div>
          <div>
            <h3 className="font-medium text-slate-500 text-sm">当前借款状态</h3>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900">无借款</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">目前没有正在进行的借款</p>
          </div>
          <div className="mt-4">
             <span className="inline-flex items-center text-sm font-medium text-blue-600 cursor-pointer hover:underline">
               查看历史记录 &rarr;
             </span>
          </div>
        </div>

        {/* Repayment Status Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between h-40">
           <div>
            <h3 className="font-medium text-slate-500 text-sm">本期应还</h3>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900">¥ 0.00</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">暂无需还款项</p>
          </div>
          <div className="mt-4">
            <button disabled className="text-sm font-medium text-slate-400 cursor-not-allowed">
              立即还款
            </button>
          </div>
        </div>

        {/* Action Card */}
         <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6 shadow-sm flex flex-col justify-center items-center text-center h-40">
            <div className="mb-3 h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
               <IconDoc />
            </div>
            <h3 className="font-semibold text-slate-900">申请借款</h3>
            <p className="text-xs text-slate-500 mt-1 mb-3">暂未开放线上自主申请</p>
         </div>
      </div>

      {/* Recent Activity List */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
           <h3 className="font-semibold text-slate-900">最近动态</h3>
           <Link href="#" className="text-sm text-blue-600 hover:text-blue-700">查看全部</Link>
        </div>
        <div className="p-6 text-center text-slate-500 text-sm py-12">
           <div className="bg-slate-50 rounded-full h-12 w-12 flex items-center justify-center mx-auto mb-3">
             <IconClock />
           </div>
           暂无最新动态
        </div>
      </div>
    </div>
  );
}
