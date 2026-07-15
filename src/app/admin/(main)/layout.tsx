import { redirect } from "next/navigation";
import AdminWorkspaceShell from "@/components/admin/AdminWorkspaceShell";
import { getActiveAdminSession } from "@/lib/portal-session";

export default async function AdminMainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getActiveAdminSession();
  if (!session) redirect("/admin/login");

  return <AdminWorkspaceShell>{children}</AdminWorkspaceShell>;
}
