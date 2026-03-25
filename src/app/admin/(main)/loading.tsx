function LoadingCard({ className = "" }: { className?: string }) {
  return <div className={`dashboard-panel animate-pulse ${className}`} />;
}

export default function AdminMainLoading() {
  return (
    <div className="space-y-5 2xl:space-y-6">
      <div className="dashboard-panel px-5 py-4 xl:px-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(520px,1fr)] xl:items-center">
          <div className="space-y-3">
            <div className="h-4 w-28 rounded-full bg-slate-200/80" />
            <div className="h-10 w-72 rounded-2xl bg-slate-200/80" />
            <div className="h-4 w-80 rounded-full bg-slate-100" />
            <div className="flex flex-wrap gap-2">
              <div className="h-8 w-40 rounded-full bg-slate-100" />
              <div className="h-8 w-36 rounded-full bg-slate-100" />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <div className="h-10 rounded-full bg-slate-100" />
            <div className="h-10 rounded-full bg-slate-100" />
            <div className="h-10 rounded-full bg-slate-100" />
            <div className="h-10 rounded-full bg-slate-100" />
            <div className="h-10 rounded-full bg-slate-100" />
            <div className="h-10 rounded-full bg-slate-100" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <LoadingCard className="h-72 xl:col-span-8" />
        <LoadingCard className="h-72 xl:col-span-4" />
        <LoadingCard className="h-80 xl:col-span-12" />
        <LoadingCard className="h-72 xl:col-span-4" />
        <LoadingCard className="h-72 xl:col-span-4" />
        <LoadingCard className="h-72 xl:col-span-4" />
      </div>
    </div>
  );
}
