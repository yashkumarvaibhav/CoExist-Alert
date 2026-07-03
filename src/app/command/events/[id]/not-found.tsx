import Link from "next/link";

export default function EventNotFound() {
  return (
    <section className="rounded-lg border border-line bg-raised px-4 py-10 text-center sm:px-6">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-faint">
        Event record
      </p>
      <h1 className="mt-2 text-3xl">Event not found</h1>
      <p className="mx-auto mt-3 max-w-xl text-sm text-muted">
        This incursion record is not available in the current command log.
      </p>
      <Link
        href="/command/events"
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-contrast hover:bg-accent-hover"
      >
        Back to events log
      </Link>
    </section>
  );
}
