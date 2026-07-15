import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActiveClientSession } from "@/lib/portal-session";
import { getClientProfileCompletion } from "@/lib/client-profile";
import { prisma } from "@/lib/prisma";
import { ClientHeader } from "@/components/client/Header";
import { ClientProfileGate } from "@/components/client/ClientProfileGate";
import { AppRuntimeBridge } from "@/components/pwa/AppRuntimeBridge";
import { MobileBottomNav } from "@/components/pwa/MobileBottomNav";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getActiveClientSession();
  if (!session) redirect("/client/login");

  const username = session.name;
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-pathname") ?? "/client/profile";

  if (!pathname.startsWith("/client/profile")) {
    const customer = await prisma.customer.findFirst({
      where: { id: session.sub, deletedAt: null },
      select: {
        phone: true,
        address: true,
        taxNumber: true,
        idNumber: true,
        passportNumber: true,
        residencePermitNumber: true,
        residencePermitExpiry: true,
        kyc: {
          select: {
            kycType: true,
            documentUrl: true,
            status: true,
            expiresAt: true,
          },
        },
      },
    });

    if (customer && !getClientProfileCompletion(customer).profileComplete) {
      redirect("/client/profile?required=1");
    }
  }

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
          pollIntervalMs={10000}
        />
        <div className="app-surface fade-in-up p-4 text-slate-900 md:p-6">
          <ClientProfileGate>{children}</ClientProfileGate>
        </div>
      </main>
      <MobileBottomNav
        items={[
          { href: "/client/dashboard", label: "借款", shortLabel: "借款" },
          { href: "/client/repayments", label: "还款", shortLabel: "还款" },
          { href: "/client/repayment-plans", label: "计划", shortLabel: "计划" },
          { href: "/client/profile", label: "资料", shortLabel: "资料" },
          { href: "/client/notifications", label: "消息", shortLabel: "消息" },
        ]}
        accentClassName="text-cyan-200"
      />
    </div>
  );
}
