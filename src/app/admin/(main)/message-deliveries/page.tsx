import dynamic from "next/dynamic";

import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";

const MessageDeliveriesPageClient = dynamic(
  () =>
    import("@/components/admin/pages/MessageDeliveriesPageClient").then(
      (module) => module.MessageDeliveriesPageClient,
    ),
  {
    loading: () => <AdminPageSkeleton />,
  },
);

export default function MessageDeliveriesPage() {
  return <MessageDeliveriesPageClient />;
}
