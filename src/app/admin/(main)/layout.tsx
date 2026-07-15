import { redirect } from "next/navigation";
import AdminWorkspaceShell from "@/components/admin/AdminWorkspaceShell";
import { getActiveAdminSession } from "@/lib/portal-session";
import { getAdminPermissionCodes } from "@/lib/rbac";

export default async function AdminMainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getActiveAdminSession();
  if (!session) redirect("/admin/login");

  const permissions = await getAdminPermissionCodes(session);

  return (
    <AdminWorkspaceShell
      permissions={permissions}
      isSuperAdmin={session.roles.includes("super_admin")}
    >
      {children}
    </AdminWorkspaceShell>
  );
}
