"use client";

import { useEffect, useState } from "react";

/**
 * Chromium fires `beforeinstallprompt` once the app meets the install
 * criteria; this button captures that event and replays it on click, so a
 * guard can pin the response console to their phone's home screen. Browsers
 * that never fire the event (Safari installs via Share → Add to Home Screen)
 * simply never see the button — install is a progressive enhancement.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallAppButton() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function capturePrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }
    function clearPrompt() {
      setInstallPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", clearPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", clearPrompt);
    };
  }, []);

  if (installPrompt === null) {
    return null;
  }

  async function install() {
    if (installPrompt === null) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstallPrompt(null);
    }
  }

  return (
    <button
      type="button"
      onClick={install}
      aria-label="Install app"
      title="Install the app on this device"
      className="flex h-11 w-11 items-center justify-center gap-2 rounded-md border border-line text-sm font-medium text-ink transition-colors hover:bg-hover sm:w-auto sm:px-3"
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
        strokeLinejoin="round"
      >
        <path d="M12 3v12M7 10l5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
      <span className="hidden sm:inline">Install app</span>
    </button>
  );
}
