import { getClientSession } from "@/lib/auth";
import Link from "next/link";

export default async function ClientDashboardPage() {
  const session = await getClientSession();

  if (!session) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-600 mb-4">请先登录查看您的借款信息</p>
        <Link href="/client/login" className="text-blue-600 hover:underline">去登录</Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">我的借款</h1>
        <p className="text-sm text-slate-500 mt-1">您好, {session.name}</p>
      </header>

      <div className="space-y-4">
        <div className="rounded-lg border bg-white p-4">
          <h2 className="font-medium text-slate-700 mb-2">待办事项</h2>
          <p className="text-sm text-slate-500">暂无待处理项目</p>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <h2 className="font-medium text-slate-700 mb-2">我的合同</h2>
          <p className="text-sm text-slate-500">暂无合同记录</p>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <h2 className="font-medium text-slate-700 mb-2">还款记录</h2>
          <p className="text-sm text-slate-500">暂无还款记录</p>
        </div>
      </div>
    </div>
  );
}
