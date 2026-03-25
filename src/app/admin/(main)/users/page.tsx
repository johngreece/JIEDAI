import dynamic from "next/dynamic";

import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";

const UsersPageClient = dynamic(
  () => import("@/components/admin/pages/UsersPageClient").then((module) => module.UsersPageClient),
  {
    loading: () => <AdminPageSkeleton />,
  },
);

export default function UsersPage() {
  return <UsersPageClient />;
}
