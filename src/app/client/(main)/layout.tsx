import { getClientSession } from "@/lib/auth";
import { ClientHeader } from "@/components/client/Header";
import { AppRuntimeBridge } from "@/components/pwa/AppRuntimeBridge";
import { MobileBottomNav } from "@/components/pwa/MobileBottomNav";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getClientSession();
  const username = session?.name || "Guest";

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-0 top-12 h-72 w-72 rounded-full bg-cyan-300/15 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-blue-400/15 blur-3xl" />
      </div>

      <ClientHeader username={username} />
      <main className="app-shell-main relative flex-1 py-4 md:py-8">
        <AppRuntimeBridge
          portal="client"
          notificationsEndpoint="/api/client/notifications"
          notificationsPageHref="/client/notifications"
          appName="借贷客户端"
        />
        <div className="app-surface fade-in-up p-4 text-slate-900 md:p-6">
          {children}
        </div>
      </main>
      <MobileBottomNav
        items={[
          { href: "/client/dashboard", label: "借款", shortLabel: "借款" },
          { href: "/client/repayments", label: "还款", shortLabel: "还款" },
          { href: "/client/repayment-plans", label: "计划", shortLabel: "计划" },
          { href: "/client/notifications", label: "消息", shortLabel: "消息" },
        ]}
        accentClassName="text-cyan-200"
      />
    </div>
  );
}
