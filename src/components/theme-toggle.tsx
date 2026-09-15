"use client";

import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";

const STORAGE_KEY = "speedlead-theme";

// A tiny external store rather than component state: the actual source
// of truth is the `dark` class on <html> (set pre-hydration in
// layout.tsx, read here, mutated on toggle) — useSyncExternalStore is
// the React-recommended way to read/subscribe to that kind of external
// mutable state without a hydration mismatch (server can't know the
// user's stored preference) or a setState-in-effect anti-pattern. Also
// means multiple ThemeToggle instances on one page (dashboard + admin
// layouts) stay in sync with each other automatically.
let listeners: Array<() => void> = [];
let currentIsDark = false;
let initialized = false;

function ensureInit() {
  if (initialized || typeof document === "undefined") return;
  currentIsDark = document.documentElement.classList.contains("dark");
  initialized = true;
}

function subscribe(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getSnapshot() {
  ensureInit();
  return currentIsDark;
}

function getServerSnapshot() {
  return false;
}

function setDark(next: boolean) {
  currentIsDark = next;
  initialized = true;
  document.documentElement.classList.toggle("dark", next);
  try {
    localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
  } catch {
    // localStorage can throw in private-browsing edge cases — the
    // toggle still works for this page load, just won't persist.
  }
  listeners.forEach((listener) => listener());
}

export function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setDark(!isDark)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-slate-200 transition-colors ${
        isDark ? "bg-brand-600" : "bg-slate-200"
      }`}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform ${
          isDark ? "translate-x-5" : "translate-x-0.5"
        }`}
      >
        {isDark ? (
          <Moon className="h-3 w-3 text-brand-700" strokeWidth={2.5} />
        ) : (
          <Sun className="h-3 w-3 text-amber-500" strokeWidth={2.5} />
        )}
      </span>
    </button>
  );
}
