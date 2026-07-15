import dynamic from "next/dynamic";

import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { getLoanApplicationsList } from "@/lib/admin-prefetch";
import { requirePermission } from "@/lib/rbac";

const LoanApplicationsPageClient = dynamic(
  () => import("@/components/admin/pages/LoanApplicationsPageClient").then((module) => module.LoanApplicationsPageClient),
  {
    loading: () => <AdminPageSkeleton />,
  },
);

export default async function LoanApplicationsPage() {
  const session = await requirePermission(["loan:view"]);

  if (session instanceof Response) {
    return <AdminAccessDenied />;
  }

  const result = await getLoanApplicationsList({ page: 1, pageSize: 20 });

  return <LoanApplicationsPageClient initialItems={result.items} initialStatus="ALL" />;
}
