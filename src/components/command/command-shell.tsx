"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { BuildStamp } from "@/components/build-stamp";
import { CommandNav, type NavNode } from "@/components/command/command-nav";
import type { SearchItem } from "@/lib/search";
import { LiveStatus } from "@/components/command/live-status";
import { RoleSwitcher } from "@/components/command/role-switcher";
import { SearchPalette } from "@/components/command/search-palette";
import { SoundToggle } from "@/components/command/sound-toggle";
import { ConfirmedAlarm, type AlarmSeedEvent } from "@/components/confirmed-alarm";
import { ConnectionBanner } from "@/components/connection-banner";
import { LiveStreamProvider } from "@/components/live-stream-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_NAME } from "@/lib/app-info";

/**
 * Command console shell: persistent sidebar (desktop) / drawer (mobile),
 * top bar with wordmark + live-stream status + role switcher + theme toggle,
 * and the build-stamp footer. Wraps every /command route.
 */
export function CommandShell({
  nodes,
  searchItems,
  alarmEvents,
  children,
}: {
  nodes: NavNode[];
  searchItems: SearchItem[];
  alarmEvents: AlarmSeedEvent[];
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const openButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (drawerOpen) closeButtonRef.current?.focus();
  }, [drawerOpen]);

  function closeDrawer() {
    setDrawerOpen(false);
    openButtonRef.current?.focus();
  }

  function onDrawerKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeDrawer();
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = drawerRef.current?.querySelectorAll<HTMLElement>(
      "a[href], button:not([tabindex='-1'])",
    );
    if (focusables === undefined || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <LiveStreamProvider>
    <ConfirmedAlarm initialEvents={alarmEvents} />
    <div className="flex min-h-screen bg-page">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:border-line focus:bg-raised focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-accent"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 overflow-y-auto border-r border-line bg-sidebar lg:block">
        <div className="border-b border-line px-4 py-4">
          <Link href="/command" className="flex items-center gap-2.5">
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
            <span className="min-w-0 truncate font-serif text-xl font-medium tracking-tight text-ink">
              {APP_NAME}
            </span>
          </Link>
          <p className="mt-2 text-xs text-muted">Early-warning command console</p>
        </div>
        <CommandNav nodes={nodes} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-page px-4 py-2.5 sm:gap-3 sm:px-6">
          <button
            ref={openButtonRef}
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line text-ink transition-colors hover:bg-hover lg:hidden"
          >
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 6.5h16M4 12h16M4 17.5h16" />
            </svg>
          </button>

          <Link
            href="/command"
            className="hidden min-w-0 items-center gap-2.5 sm:flex lg:hidden"
          >
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

          <SearchPalette items={searchItems} />

          <div className="ml-auto flex shrink-0 items-center gap-1 max-lg:ml-0 sm:gap-2">
            <LiveStatus />
            <SoundToggle />
            <RoleSwitcher />
            <ThemeToggle />
          </div>
        </header>

        <ConnectionBanner />

        <main id="main" tabIndex={-1} className="min-w-0 flex-1 overflow-x-clip px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-xs text-faint sm:px-6">
          <span>Team GitBoosters · Edge early-warning for human-wildlife conflict</span>
          <BuildStamp />
        </footer>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            aria-hidden="true"
            onClick={closeDrawer}
            className="absolute inset-0 bg-black/40"
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Command navigation"
            onKeyDown={onDrawerKeyDown}
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-line bg-sidebar shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-line py-2.5 pl-4 pr-3">
              <span className="font-serif text-lg font-medium tracking-tight text-ink">
                {APP_NAME}
              </span>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeDrawer}
                aria-label="Close navigation"
                className="flex h-11 w-11 items-center justify-center rounded-md border border-line text-ink transition-colors hover:bg-hover"
              >
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M5 5l14 14M19 5L5 19" />
                </svg>
              </button>
            </div>
            <CommandNav nodes={nodes} onNavigate={closeDrawer} />
          </div>
        </div>
      )}
    </div>
    </LiveStreamProvider>
  );
}
