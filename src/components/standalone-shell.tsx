import Image from "next/image";
import Link from "next/link";

import { BuildStamp } from "@/components/build-stamp";
import { RoleSwitcher } from "@/components/command/role-switcher";
import { SoundToggle } from "@/components/command/sound-toggle";
import { ConfirmedChime } from "@/components/confirmed-chime";
import { ConnectionBanner } from "@/components/connection-banner";
import { LiveStreamProvider } from "@/components/live-stream-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_NAME } from "@/lib/app-info";

/**
 * Minimal chrome for the standalone persona surfaces (/guard, /channels,
 * /demo): wordmark, role switcher and theme toggle — no command sidebar.
 * `wide` relaxes the single-column width for multi-panel demo surfaces.
 * `sound` shows the confirmed-event chime toggle (Guard only, per spec).
 * Children share one EventSource via the wrapping LiveStreamProvider, which
 * also feeds the reconnect banner.
 */
export function StandaloneShell({
  children,
  wide = false,
  sound = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
  sound?: boolean;
}) {
  return (
    <LiveStreamProvider>
      {sound && <ConfirmedChime />}
      <div className="flex min-h-screen flex-col bg-page">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:border-line focus:bg-raised focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-accent"
        >
          Skip to content
        </a>

        <header className="flex items-center gap-2 border-b border-line px-4 py-2.5 sm:gap-3 sm:px-6">
          <Link href="/command" className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-line bg-white">
              <Image
                src="/coexist-icon.png"
                alt=""
                width={28}
                height={28}
                priority
                className="h-7 w-7 object-contain"
              />
            </span>
            <span className="hidden truncate font-serif text-xl font-medium tracking-tight text-ink sm:inline">
              {APP_NAME}
            </span>
          </Link>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {sound && <SoundToggle />}
            <RoleSwitcher />
            <ThemeToggle />
          </div>
        </header>

        <ConnectionBanner />

        <main
          id="main"
          tabIndex={-1}
          className={`mx-auto flex w-full flex-1 flex-col gap-6 px-4 py-8 sm:px-6 ${
            wide ? "max-w-6xl" : "max-w-xl"
          }`}
        >
          {children}
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-xs text-faint sm:px-6">
          <span>Team GitBoosters · Edge early-warning for human-wildlife conflict</span>
          <BuildStamp />
        </footer>
      </div>
    </LiveStreamProvider>
  );
}
