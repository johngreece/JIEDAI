import dynamic from "next/dynamic";

import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { getAdminSession } from "@/lib/auth";
import { getLoanApplicationsList } from "@/lib/admin-prefetch";

const LoanApplicationsPageClient = dynamic(
  () => import("@/components/admin/pages/LoanApplicationsPageClient").then((module) => module.LoanApplicationsPageClient),
  {
    loading: () => <AdminPageSkeleton />,
  },
);

export default async function LoanApplicationsPage() {
  const session = await getAdminSession();

  if (!session) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <div className="panel-soft max-w-md rounded-[1.6rem] p-6 text-center">
          <h2 className="text-xl font-semibold text-slate-900">需要先登录后台</h2>
          <p className="mt-2 text-sm text-slate-500">登录后即可处理借款申请、风控和审批。</p>
          <a href="/admin/login" className="admin-btn admin-btn-primary mt-5 inline-flex">
            前往登录
          </a>
        </div>
      </div>
    );
  }

  const result = await getLoanApplicationsList({ page: 1, pageSize: 20 });

  return <LoanApplicationsPageClient initialItems={result.items} initialStatus="ALL" />;
}
