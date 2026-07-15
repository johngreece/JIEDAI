export function AdminAccessDenied() {
  return (
    <div className="flex min-h-[24rem] items-center justify-center">
      <div className="panel-soft max-w-md rounded-[1.6rem] p-6 text-center">
        <h2 className="text-xl font-semibold text-slate-900">没有访问权限</h2>
        <p className="mt-2 text-sm text-slate-500">
          当前账号无权访问此工作区，请联系系统管理员调整角色权限。
        </p>
      </div>
    </div>
  );
}
