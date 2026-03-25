import { FundersPageClient } from "@/components/admin/pages/FundersPageClient";
import { getAdminSession, isSuperAdmin } from "@/lib/auth";
import { getFundersList } from "@/lib/admin-prefetch";

export default async function FundersPage() {
  const session = await getAdminSession();

  if (!session) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <div className="panel-soft max-w-md rounded-[1.6rem] p-6 text-center">
          <h2 className="text-xl font-semibold text-slate-900">需要先登录后台</h2>
          <p className="mt-2 text-sm text-slate-500">登录后即可管理资金方、资金账户和注资流程。</p>
          <a href="/admin/login" className="admin-btn admin-btn-primary mt-5 inline-flex">
            前往登录
          </a>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin(session)) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <div className="panel-soft max-w-md rounded-[1.6rem] p-6 text-center">
          <h2 className="text-xl font-semibold text-slate-900">没有访问权限</h2>
          <p className="mt-2 text-sm text-slate-500">资金方管理仅限系统管理员使用。</p>
        </div>
      </div>
    );
  }

  const result = await getFundersList({ page: 1, pageSize: 20 });

  return <FundersPageClient initialItems={result.items} />;
}
