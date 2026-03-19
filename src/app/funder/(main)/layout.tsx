import { getFunderSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { FunderHeader } from "./FunderHeader";

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
      <main className="relative mx-auto flex-1 w-full max-w-7xl p-4 py-8 lg:px-8">
        <div className="fade-in-up rounded-2xl border border-white/40 bg-white/90 p-4 text-slate-900 shadow-xl backdrop-blur-sm md:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
