import dynamic from "next/dynamic";

import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";

const ProductsPageClient = dynamic(
  () => import("@/components/admin/pages/ProductsPageClient").then((module) => module.ProductsPageClient),
  {
    loading: () => <AdminPageSkeleton />,
  },
);

export default function ProductsPage() {
  return <ProductsPageClient />;
}
