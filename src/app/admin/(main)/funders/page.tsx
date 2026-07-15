import dynamic from "next/dynamic";

import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { isSuperAdmin } from "@/lib/auth";
import { getFundersList } from "@/lib/admin-prefetch";
import { requireAdmin } from "@/lib/rbac";

const FundersPageClient = dynamic(
  () => import("@/components/admin/pages/FundersPageClient").then((module) => module.FundersPageClient),
  {
    loading: () => <AdminPageSkeleton />,
  },
);

export default async function FundersPage() {
  const session = await requireAdmin();

  if (session instanceof Response) {
    return <AdminAccessDenied />;
  }

  if (!isSuperAdmin(session)) {
    return <AdminAccessDenied />;
  }

  const result = await getFundersList({ page: 1, pageSize: 20 });

  return <FundersPageClient initialItems={result.items} />;
}
