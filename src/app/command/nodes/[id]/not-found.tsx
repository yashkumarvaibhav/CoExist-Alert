import Link from "next/link";

export default function NodeNotFound() {
  return (
    <section className="rounded-lg border border-line bg-raised px-4 py-10 text-center sm:px-6">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-faint">
        Node record
      </p>
      <h1 className="mt-2 text-3xl">Node not found</h1>
      <p className="mx-auto mt-3 max-w-xl text-sm text-muted">
        This sensor is not in the current Dooars corridor deployment.
      </p>
      <Link
        href="/command"
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-contrast hover:bg-accent-hover"
      >
        Back to command dashboard
      </Link>
    </section>
  );
}
