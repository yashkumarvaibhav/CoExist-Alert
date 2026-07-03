function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-sm bg-hover ${className}`}
    />
  );
}

export default function EventDetailLoading() {
  return (
    <div
      aria-label="Loading event detail"
      className="flex animate-pulse flex-col gap-6"
      role="status"
    >
      <div className="flex flex-col gap-3">
        <SkeletonBlock className="h-10 w-80 max-w-full" />
        <SkeletonBlock className="h-5 w-96 max-w-full" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <section className="rounded-lg border border-line bg-raised px-4 py-4 sm:px-6">
          <SkeletonBlock className="h-5 w-40" />
          <div className="mt-6 flex flex-col gap-4">
            {Array.from({ length: 7 }, (_, index) => (
              <SkeletonBlock key={index} className="h-16 w-full" />
            ))}
          </div>
        </section>
        <section className="rounded-lg border border-line bg-raised px-4 py-4 sm:px-6">
          <SkeletonBlock className="h-5 w-32" />
          <div className="mt-6 flex flex-col gap-3">
            {Array.from({ length: 6 }, (_, index) => (
              <SkeletonBlock key={index} className="h-12 w-full" />
            ))}
          </div>
        </section>
      </div>
      <span className="sr-only">Loading event detail</span>
    </div>
  );
}
