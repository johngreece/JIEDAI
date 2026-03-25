import dynamic from "next/dynamic";

import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";

const SettlementPageClient = dynamic(
  () => import("@/components/admin/pages/SettlementPageClient").then((module) => module.SettlementPageClient),
  {
    loading: () => <AdminPageSkeleton />,
  },
);

export default function SettlementPage() {
  return <SettlementPageClient />;
}
