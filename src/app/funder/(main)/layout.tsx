import { getFunderSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { FunderHeader } from "./FunderHeader";
import { AppRuntimeBridge } from "@/components/pwa/AppRuntimeBridge";
import { MobileBottomNav } from "@/components/pwa/MobileBottomNav";

export default async function FunderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getFunderSession();
  if (!session) redirect("/funder/login");

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-0 top-12 h-72 w-72 rounded-full bg-emerald-300/15 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-teal-400/15 blur-3xl" />
      </div>

      <FunderHeader username={session.name} />
      <main className="app-shell-main relative flex-1 py-4 md:py-8">
        <AppRuntimeBridge
          portal="funder"
          notificationsEndpoint="/api/funder/notifications"
          notificationsPageHref="/funder/notifications"
          appName="资金方平台"
        />
        <div className="app-surface fade-in-up p-4 text-slate-900 md:p-6">
          {children}
        </div>
      </main>
      <MobileBottomNav
        items={[
          { href: "/funder/dashboard", label: "概览", shortLabel: "概览" },
          { href: "/funder/disbursements", label: "放款", shortLabel: "放款" },
          { href: "/funder/withdrawals", label: "提现", shortLabel: "提现" },
          { href: "/funder/notifications", label: "消息", shortLabel: "消息" },
        ]}
        accentClassName="text-emerald-200"
      />
    </div>
  );
}
