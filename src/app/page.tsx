import { ThemeToggle } from "@/components/theme-toggle";
import { APP_NAME } from "@/lib/app-info";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <header className="flex items-center justify-between border-b border-line px-6 py-3">
        <span className="font-serif text-2xl font-medium tracking-tight text-ink">
          {APP_NAME}
        </span>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-faint">
          Code with Cisco · CSR Challenge · Team GitBoosters
        </p>
        <h1 className="max-w-3xl text-balance">
          Seconds save lives on both sides.
        </h1>
        <p className="max-w-xl text-body">
          Edge early-warning for human-wildlife conflict: detect a large animal
          approaching the forest edge, confirm it, and warn villagers, forest
          guards and rail control within seconds — with the network itself
          monitored so a warning never silently fails.
        </p>
        <span className="rounded-sm border border-line px-3 py-1.5 text-xs uppercase tracking-[0.08em] text-muted">
          Platform in build — sprint to 13 July 2026
        </span>
      </main>

      <footer className="border-t border-line px-6 py-4 text-center text-sm text-faint">
        Team GitBoosters · Code with Cisco Silver Flag CSR Challenge
      </footer>
    </div>
  );
}
