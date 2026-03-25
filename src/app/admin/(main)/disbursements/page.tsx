import dynamic from "next/dynamic";

import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";

const DisbursementsPageClient = dynamic(
  () => import("@/components/admin/pages/DisbursementsPageClient").then((module) => module.DisbursementsPageClient),
  {
    loading: () => <AdminPageSkeleton />,
  },
);

export default function DisbursementsPage() {
  return <DisbursementsPageClient />;
}
