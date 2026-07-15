import dynamic from "next/dynamic";

import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { getCustomersList } from "@/lib/admin-prefetch";
import { requirePermission } from "@/lib/rbac";

const CustomersPageClient = dynamic(
  () => import("@/components/admin/pages/CustomersPageClient").then((module) => module.CustomersPageClient),
  {
    loading: () => <AdminPageSkeleton />,
  },
);

export default async function CustomersPage() {
  const session = await requirePermission(["customer:view"]);

  if (session instanceof Response) {
    return <AdminAccessDenied />;
  }

  const result = await getCustomersList({ page: 1, pageSize: 20 });

  return (
    <CustomersPageClient
      initialItems={result.items}
      initialTotal={result.total}
      initialPage={result.page}
      initialKeyword=""
    />
  );
}
