import dynamic from "next/dynamic";

import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";

const FinanceReconciliationPageClient = dynamic(
  () =>
    import("@/components/admin/pages/FinanceReconciliationPageClient").then(
      (module) => module.FinanceReconciliationPageClient,
    ),
  { loading: () => <AdminPageSkeleton /> },
);

export default function FinanceReconciliationPage() {
  return <FinanceReconciliationPageClient />;
}
