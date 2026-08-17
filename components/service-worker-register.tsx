"use client"

import { useEffect } from "react"

/**
 * Registers the minimal passthrough service worker (public/sw.js) once on
 * mount. This is a genuine side effect / external-system sync (an
 * imperative browser API call, no render state involved) — unlike the
 * speechSynthesis feature-detection elsewhere in this app, there's nothing
 * here a useSyncExternalStore would do better, so a plain useEffect is the
 * right tool.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("Service worker registration failed:", error)
      })
    }
  }, [])

  return null
}
