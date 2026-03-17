import { getClientSession } from "@/lib/auth";
import { ClientHeader } from "@/components/client/Header";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getClientSession();
  const username = session?.name || "Guest";

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <ClientHeader username={username} />
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
