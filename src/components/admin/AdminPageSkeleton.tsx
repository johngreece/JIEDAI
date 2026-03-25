type AdminPageSkeletonProps = {
  mode?: "table" | "dashboard";
};

function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[1.6rem] bg-slate-200/80 ${className}`} />;
}

export function AdminPageSkeleton({ mode = "table" }: AdminPageSkeletonProps) {
  if (mode === "dashboard") {
    return (
      <div className="space-y-5 2xl:space-y-6">
        <div className="dashboard-panel px-5 py-4 xl:px-6">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(520px,1fr)] xl:items-center">
            <div className="space-y-3">
              <Block className="h-4 w-28 rounded-full" />
              <Block className="h-10 w-72" />
              <Block className="h-4 w-96 rounded-full" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Block className="h-28" />
              <Block className="h-28" />
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-12">
          <Block className="dashboard-panel h-72 xl:col-span-8" />
          <Block className="dashboard-panel h-72 xl:col-span-4" />
          <Block className="dashboard-panel h-80 xl:col-span-12" />
          <Block className="dashboard-panel h-72 xl:col-span-4" />
          <Block className="dashboard-panel h-72 xl:col-span-4" />
          <Block className="dashboard-panel h-72 xl:col-span-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="panel-soft rounded-[1.8rem] px-5 py-4">
        <Block className="h-7 w-56" />
        <Block className="mt-3 h-4 w-80 rounded-full" />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Block className="h-24" />
        <Block className="h-24" />
        <Block className="h-24" />
      </div>

      <div className="table-shell overflow-hidden rounded-[1.8rem]">
        <div className="border-b border-slate-100 px-4 py-3">
          <Block className="h-10 w-56 rounded-full" />
        </div>
        <div className="space-y-3 px-4 py-4">
          <Block className="h-14" />
          <Block className="h-14" />
          <Block className="h-14" />
          <Block className="h-14" />
        </div>
      </div>
    </div>
  );
}
