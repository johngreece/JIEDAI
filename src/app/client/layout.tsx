import Link from "next/link";
import { getClientSession } from "@/lib/auth";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getClientSession();

  return (
    <div className="min-h-screen flex flex-col">
      {/* 顶栏 */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/client/dashboard" className="font-semibold text-slate-800">我的借款</Link>
        </div>
        <div>
          {session ? (
            <span className="text-sm text-slate-600">{session.name}</span>
          ) : (
            <Link href="/client/login" className="text-sm text-blue-600 hover:underline">登录</Link>
          )}
        </div>
      </header>
      {/* 主内容 */}
      <main className="flex-1 bg-slate-50">{children}</main>
    </div>
  );
}
