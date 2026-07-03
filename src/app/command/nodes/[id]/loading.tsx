function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-sm bg-hover ${className}`}
    />
  );
}

export default function NodeDetailLoading() {
  return (
    <div
      aria-label="Loading node detail"
      className="flex animate-pulse flex-col gap-6"
      role="status"
    >
      <div className="flex flex-wrap items-center gap-3">
        <SkeletonBlock className="size-6 rounded-full" />
        <SkeletonBlock className="h-9 w-72 max-w-full" />
        <SkeletonBlock className="h-6 w-24" />
      </div>

      <section className="rounded-lg border border-line bg-raised px-4 py-4 sm:px-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex flex-col gap-2">
              <SkeletonBlock className="h-3 w-24" />
              <SkeletonBlock className="h-5 w-36" />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-raised px-4 py-4 sm:px-6">
        <SkeletonBlock className="h-5 w-56" />
        <SkeletonBlock className="mt-5 h-56 w-full" />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-line bg-raised px-4 py-4 sm:px-6">
          <SkeletonBlock className="h-5 w-40" />
          <SkeletonBlock className="mt-5 h-48 w-full" />
        </section>
        <section className="rounded-lg border border-line bg-raised px-4 py-4 sm:px-6">
          <SkeletonBlock className="h-5 w-44" />
          <SkeletonBlock className="mt-5 h-48 w-full" />
        </section>
      </div>
      <span className="sr-only">Loading node detail</span>
    </div>
  );
}
