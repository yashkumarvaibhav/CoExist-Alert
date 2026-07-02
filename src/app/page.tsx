import Image from "next/image";

import { BuildStamp } from "@/components/build-stamp";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_NAME } from "@/lib/app-info";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <header className="flex items-center justify-between border-b border-line px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-sm border border-line bg-white">
            <Image
              src="/coexist-icon.png"
              alt=""
              width={34}
              height={34}
              priority
              className="h-8 w-8 object-contain"
            />
          </span>
          <span className="font-serif text-2xl font-medium tracking-tight text-ink">
            {APP_NAME}
          </span>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <Image
          src="/coexist-logo.png"
          alt="CoExist Alert - Human-Animal Coexistence and Response"
          width={360}
          height={287}
          priority
          className="h-auto w-full max-w-[19rem] rounded-md border border-line bg-white p-3 shadow-sm sm:max-w-sm"
        />
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

      <footer className="flex flex-col items-center gap-1 border-t border-line px-6 py-4 text-center text-sm text-faint">
        <span>Team GitBoosters · Code with Cisco Silver Flag CSR Challenge</span>
        <BuildStamp />
      </footer>
    </div>
  );
}
