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
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* 侧边栏 */}
      <aside className="hidden lg:flex lg:w-72 lg:flex-col fixed insert-y-0 z-50 h-full">
        <AdminSidebar userRole={userRole} username={username} />
      </aside>

      {/* 主内容区域 - 需要留出Sidebar的宽度 */}
      <main className="flex-1 lg:pl-72 flex flex-col min-w-0 overflow-auto h-full w-full">
        <div className="grow p-4 md:p-8 lg:p-10 max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
