"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { LoginForm } from "./login-form";

function clearSignInQuery() {
  const url = new URL(window.location.href);
  if (url.searchParams.get("signin") !== "1") return;
  url.searchParams.delete("signin");
  url.searchParams.delete("next");
  const query = url.searchParams.toString();
  window.history.replaceState(
    null,
    "",
    `${url.pathname}${query === "" ? "" : `?${query}`}${url.hash}`,
  );
}

/**
 * Sign-in entry point on the landing page: a button that opens an accessible
 * modal wrapping the login form. Auto-opens when the request proxy bounces an
 * unauthenticated visitor here (`?signin=1`), preserving the `next` path.
 */
export function SignInLauncher({
  defaultOpen = false,
  next = null,
  label = "Sign in",
}: {
  defaultOpen?: boolean;
  next?: string | null;
  label?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closeModal = useCallback(() => {
    setOpen(false);
    clearSignInQuery();
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKey);
    const panel = panelRef.current;
    const firstField =
      panel?.querySelector<HTMLElement>("input[name='username']") ??
      panel?.querySelector<HTMLElement>("input, button");
    firstField?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [closeModal, open]);

  function onDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const focusables = panelRef.current?.querySelectorAll<HTMLElement>("input, button");
    if (!focusables || focusables.length === 0) return;
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
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 items-center justify-center rounded-md border border-line bg-raised px-4 text-sm font-medium text-ink hover:bg-hover"
      >
        {label}
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Sign in"
          onKeyDown={onDialogKeyDown}
          className="fixed inset-0 z-[2147483000] flex items-start justify-center"
        >
          <button
            type="button"
            aria-label="Close sign in"
            onClick={closeModal}
            className="absolute inset-0 h-full w-full cursor-default bg-ink/50 backdrop-blur-[2px]"
          />
          <div
            ref={panelRef}
            className="relative z-10 mt-[10vh] mb-6 w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-lg border border-line bg-raised shadow-lg"
          >
            <button
              type="button"
              onClick={closeModal}
              aria-label="Close"
              className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-hover"
            >
              ✕
            </button>
            <LoginForm next={next} />
          </div>
        </div>
      )}
    </>
  );
}
