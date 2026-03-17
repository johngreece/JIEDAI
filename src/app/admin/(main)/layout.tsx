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

      <aside className="fixed inset-y-0 z-50 hidden w-72 lg:flex lg:flex-col">
        <AdminSidebar userRole={userRole} username={username} />
      </aside>

      <main className="relative flex min-h-screen w-full flex-col overflow-auto lg:pl-72">
        <div className="mx-auto w-full max-w-7xl p-4 md:p-8 lg:p-10">
          <div className="glass-login-card mb-4 rounded-2xl px-4 py-3 md:px-5">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-100/85">Admin Workspace</p>
            <p className="mt-1 text-sm text-slate-200/85">欢迎回来，{username}。今天继续推进高质量借贷运营管理。</p>
          </div>
          <div className="fade-in-up rounded-2xl border border-white/40 bg-white/90 p-4 text-slate-900 shadow-xl backdrop-blur-sm md:p-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
