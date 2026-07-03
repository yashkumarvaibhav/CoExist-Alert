function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-sm bg-hover ${className}`} />;
}

/**
 * Transient skeleton for command-group navigations (dashboard, events list,
 * analytics) before the per-request server render resolves. Detail routes
 * (nodes/[id], events/[id]) keep their own tailored skeletons.
 */
export default function CommandLoading() {
  return (
    <div
      role="status"
      aria-label="Loading console view"
      className="flex animate-pulse flex-col gap-6"
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-lg border border-line bg-raised px-4 py-4">
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="mt-4 h-7 w-20" />
            <SkeletonBlock className="mt-3 h-3 w-28" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <section className="rounded-lg border border-line bg-raised p-4">
          <SkeletonBlock className="h-[22rem] w-full" />
        </section>
        <section className="flex flex-col gap-3 rounded-lg border border-line bg-raised p-4">
          {Array.from({ length: 4 }, (_, index) => (
            <SkeletonBlock key={index} className="h-16 w-full" />
          ))}
        </section>
      </div>

      <section className="rounded-lg border border-line bg-raised p-4">
        <SkeletonBlock className="h-5 w-48" />
        <div className="mt-4 grid gap-3">
          {Array.from({ length: 3 }, (_, index) => (
            <SkeletonBlock key={index} className="h-12 w-full" />
          ))}
        </div>
      </section>
      <span className="sr-only">Loading console view</span>
    </div>
  );
}
