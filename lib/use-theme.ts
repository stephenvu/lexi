"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"

export type Theme = "system" | "light" | "dark"

const STORAGE_KEY = "lexi-theme"

function resolveIsDark(theme: Theme): boolean {
  if (theme === "dark") return true
  if (theme === "light") return false
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", resolveIsDark(theme))
}

// Module-level listener set — same shared-external-store shape
// lib/use-user-doc.ts uses for Firestore, here fronting localStorage
// instead, so every useTheme() instance stays in sync with a same-tab
// write from any of them (localStorage's own "storage" event only fires
// in *other* tabs, not the one that made the write).
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === "light" || stored === "dark" ? stored : "system"
}

function getServerSnapshot(): Theme {
  return "system"
}

/**
 * The device's theme preference — deliberately localStorage-backed, not
 * Firestore (see lib/use-user-doc.ts and every other settings hook): it
 * must be readable synchronously, before first paint, which an async
 * Firestore round-trip can't provide. A blocking inline script in
 * app/layout.tsx (reading this same localStorage key) already applies
 * the correct `dark` class to <html> before React hydrates — this hook
 * exists to (a) surface that value to the Settings picker, via
 * useSyncExternalStore so the client's first real read (right after
 * hydration) picks up the actual stored value with no setState-in-effect
 * needed, and (b) apply live changes (a manual switch, or an OS-level
 * prefers-color-scheme change while "system" is selected).
 */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // While "system" is active, keep the applied theme in sync with live OS
  // changes (e.g. the device switching to dark mode at sunset).
  useEffect(() => {
    if (theme !== "system") return
    const mql = window.matchMedia("(prefers-color-scheme: dark)")
    const listener = () => applyTheme(theme)
    mql.addEventListener("change", listener)
    return () => mql.removeEventListener("change", listener)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Private browsing / storage disabled — theme still applies for
      // this page load, just won't persist across reloads.
    }
    applyTheme(next)
    notify()
  }, [])

  return { theme, setTheme }
}
