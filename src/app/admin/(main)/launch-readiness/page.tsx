import dynamic from "next/dynamic";

import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";

const LaunchReadinessPageClient = dynamic(
  () => import("@/components/admin/pages/LaunchReadinessPageClient").then((module) => module.LaunchReadinessPageClient),
  {
    loading: () => <AdminPageSkeleton />,
  },
);

export default function LaunchReadinessPage() {
  return <LaunchReadinessPageClient />;
}
