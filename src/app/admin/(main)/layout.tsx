import { getAdminSession } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/Sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  
  // Safe default for unauthenticated layout (though middleware usually catches this)
  const username = session?.username ?? "Guest";
  const userRole = session?.roles ?? [];

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-cyan-300/15 blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-indigo-400/15 blur-3xl" />
      </div>

      <aside className="fixed inset-y-0 z-50 hidden w-80 lg:flex lg:flex-col">
        <AdminSidebar userRole={userRole} username={username} />
      </aside>

      <main className="relative flex min-h-screen w-full min-w-0 flex-col overflow-auto lg:pl-80">
        <div className="w-full max-w-none px-3 py-3 md:px-5 md:py-5 xl:px-6 xl:py-6 2xl:px-8">
          <div className="glass-login-card mb-4 rounded-[24px] px-4 py-3 md:px-5">
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-cyan-100/85">Admin Workspace</p>
                <p className="mt-1 text-sm text-slate-200/85">
                  欢迎回来，{username}。今天继续推进借款、还款、逾期和资金运营全流程。
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-200/80">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">全屏布局</span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">宽屏工作台</span>
              </div>
            </div>
          </div>
          <div className="fade-in-up rounded-[32px] border border-white/40 bg-white/90 p-4 text-slate-900 shadow-xl backdrop-blur-sm md:p-6 xl:p-7 2xl:p-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
