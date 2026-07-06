"use client";

import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  filterSearchItems,
  flattenResults,
  screenItemsForRole,
  searchItemsForRole,
  type SearchItem,
} from "@/lib/search";
import type { UserRole } from "@/auth/session";

/**
 * Global command palette (⌘K / Ctrl+K, plus `/` when no field is focused).
 * Hand-rolled dialog + combobox/listbox: focus-trapped, arrow-navigable,
 * Escape closes and restores focus, results announced politely. Command
 * surface only. `items` is the server-built dynamic index; the static Screens
 * list is merged in here.
 */
export function SearchPalette({ items, role }: { items: SearchItem[]; role: UserRole }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const allItems = useMemo(
    () => [...screenItemsForRole(role), ...searchItemsForRole(items, role)],
    [items, role],
  );
  const results = useMemo(() => filterSearchItems(allItems, query), [allItems, query]);
  const flat = useMemo(() => flattenResults(results), [results]);

  const openPalette = useCallback(() => {
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Global shortcuts: ⌘K / Ctrl+K anywhere; `/` only when no field is focused.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        setOpen((prev) => {
          if (!prev) {
            setQuery("");
            setActiveIndex(0);
          }
          return !prev;
        });
        return;
      }
      if (event.key === "/" && !open) {
        const el = document.activeElement;
        const tag = el?.tagName;
        const editable =
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          (el as HTMLElement | null)?.isContentEditable === true;
        if (!editable) {
          event.preventDefault();
          openPalette();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, openPalette]);

  // Focus the input when the palette opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Keep the active option in view.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(`#${CSS.escape(optionId(activeIndex))}`);
    el?.scrollIntoView({ block: "nearest" });
    // optionId is derived from baseId (stable) so this only re-runs on index.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, open]);

  function selectItem(item: SearchItem | undefined) {
    if (item === undefined) return;
    if (item.href) {
      router.push(item.href);
      setOpen(false);
      return;
    }
    // Informational rows (zones, responders): acknowledge by closing.
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (flat.length === 0 ? 0 : (i + 1) % flat.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (flat.length === 0 ? 0 : (i - 1 + flat.length) % flat.length));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(0, flat.length - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      selectItem(flat[activeIndex]);
    }
  }

  function onDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
      return;
    }
    if (event.key !== "Tab") return;
    // Single-input dialog: keep focus on the input.
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      "input, button:not([tabindex='-1'])",
    );
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

  let renderIndex = -1;

  const palette =
    open && typeof document !== "undefined"
      ? createPortal(
          <div className="search-palette-overlay fixed inset-0 flex items-start justify-center px-4 pt-[12vh]">
            <div
              aria-hidden="true"
              onClick={closePalette}
              className="search-palette-backdrop absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
            />
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-label="Search command console"
              onKeyDown={onDialogKeyDown}
              className="search-palette-panel relative flex w-full max-w-xl flex-col overflow-hidden rounded-lg border border-line bg-raised shadow-lg"
            >
              <div className="search-palette-input-row flex h-11 items-center gap-2 border-b border-line px-3 transition-colors motion-reduce:transition-none">
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={listboxId}
                  aria-activedescendant={flat.length > 0 ? optionId(activeIndex) : undefined}
                  aria-label="Search screens, nodes and events"
                  placeholder="Search screens, nodes, events…"
                  value={query}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={onInputKeyDown}
                  className="search-palette-input h-11 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
                />
              </div>

              <div ref={listRef} id={listboxId} role="listbox" aria-label="Search results" className="search-palette-results max-h-72 overflow-y-auto overflow-x-hidden bg-raised p-1">
                {flat.length === 0 ? (
                  <p className="px-3 py-7 text-center text-sm text-muted">
                    No matches — try a node or species name.
                  </p>
                ) : (
                  results.map((group) => (
                    <div
                      key={group.group}
                      role="group"
                      aria-label={group.group}
                      className="search-palette-group flex flex-col p-1"
                    >
                      <p className="search-palette-heading px-2 py-2 text-xs font-semibold uppercase tracking-wider text-muted">
                        {group.group}
                      </p>
                      {group.items.map((item) => {
                        renderIndex += 1;
                        const index = renderIndex;
                        const active = index === activeIndex;
                        return (
                          <div
                            key={item.id}
                            id={optionId(index)}
                            role="option"
                            aria-selected={active}
                            onMouseMove={() => setActiveIndex(index)}
                            onClick={() => selectItem(item)}
                            className={`search-palette-option flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-2 text-sm ${
                              active ? "bg-accent-soft text-ink" : "text-body"
                            }`}
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {item.label}
                              {item.hint && (
                                <span className="ml-2 text-xs text-muted">{item.hint}</span>
                              )}
                            </span>
                            {item.href && (
                              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-faint">
                                <path d="M7 7h10v10M7 17 17 7" />
                              </svg>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              <div className="search-palette-footer flex items-center gap-3 border-t border-line px-3 py-2 text-[11px] text-faint">
                <span className="inline-flex items-center gap-1">
                  <kbd className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-sm border border-line px-1 text-[10px] text-muted">↑</kbd>
                  <kbd className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-sm border border-line px-1 text-[10px] text-muted">↓</kbd>
                  <span>Navigate</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-sm border border-line px-1 text-[10px] text-muted">↵</kbd>
                  <span>Select</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-sm border border-line px-1 text-[10px] text-muted">Esc</kbd>
                  <span>Close</span>
                </span>
                <span className="ml-auto hidden sm:inline">All times IST</span>
              </div>

              <p aria-live="polite" className="sr-only">
                {flat.length === 0
                  ? "No results"
                  : `${flat.length} result${flat.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openPalette}
        aria-haspopup="dialog"
        aria-label="Search — open command palette"
        className="flex h-11 w-11 items-center justify-center rounded-md border border-line text-sm text-muted transition-colors hover:bg-hover max-lg:ml-auto lg:w-64 lg:justify-start lg:gap-2 lg:px-3"
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="hidden truncate lg:inline">Search the console</span>
        <kbd className="ml-auto hidden shrink-0 rounded border border-line bg-sidebar px-1.5 py-0.5 font-sans text-[10px] font-medium text-faint lg:inline">
          ⌘K
        </kbd>
      </button>

      {palette}
    </>
  );
}
