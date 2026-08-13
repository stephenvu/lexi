"use client"

import { useCallback, useSyncExternalStore } from "react"

type Listener = () => void

// Module-level so multiple hook instances (and, via the `storage` event,
// other tabs) share the same cached array reference — useSyncExternalStore
// requires getSnapshot to return a stable reference when nothing changed,
// not a fresh array every render.
const listeners = new Map<string, Set<Listener>>()
const cache = new Map<string, string[]>()

function readFromStorage(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []
  } catch {
    // Malformed JSON from a previous version, or localStorage inaccessible
    // (private browsing, disabled storage) — treat as empty rather than throw.
    return []
  }
}

function getSnapshot(key: string): string[] {
  if (!cache.has(key)) {
    cache.set(key, typeof window === "undefined" ? [] : readFromStorage(key))
  }
  return cache.get(key)!
}

// A single stable reference — useSyncExternalStore requires getServerSnapshot
// to return the same value across calls, or React sees a "changed" snapshot
// on every check and warns/loops. A fresh `[]` literal each call would violate that.
const EMPTY_LIST: string[] = []
function getServerSnapshot(): string[] {
  return EMPTY_LIST
}

function notify(key: string) {
  listeners.get(key)?.forEach((listener) => listener())
}

function writeToStorage(key: string, items: string[]) {
  cache.set(key, items)
  try {
    window.localStorage.setItem(key, JSON.stringify(items))
  } catch {
    // Storage unavailable/full — the in-memory cache still works for the
    // rest of this session; persistence silently degrades, doesn't crash.
  }
  notify(key)
}

function subscribe(key: string, listener: Listener) {
  if (!listeners.has(key)) listeners.set(key, new Set())
  listeners.get(key)!.add(listener)
  return () => listeners.get(key)?.delete(listener)
}

// Cross-tab sync: another tab writing this key fires a "storage" event here.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key && listeners.has(event.key)) {
      cache.delete(event.key) // force a re-read from storage on next getSnapshot
      notify(event.key)
    }
  })
}

export type PersistedList = {
  items: string[]
  add: (word: string) => void
  remove: (word: string) => void
  has: (word: string) => boolean
}

/**
 * A localStorage-backed list of strings, most-recently-added first, shared
 * across hook instances and browser tabs. Used for both search history
 * (capped) and favorites (uncapped) — same mechanism, different key/cap.
 */
export function usePersistedList(key: string, options?: { cap?: number }): PersistedList {
  const cap = options?.cap

  const items = useSyncExternalStore(
    useCallback((listener: Listener) => subscribe(key, listener), [key]),
    useCallback(() => getSnapshot(key), [key]),
    getServerSnapshot
  )

  const add = useCallback(
    (word: string) => {
      const deduped = [word, ...getSnapshot(key).filter((item) => item !== word)]
      writeToStorage(key, cap ? deduped.slice(0, cap) : deduped)
    },
    [key, cap]
  )

  const remove = useCallback(
    (word: string) => {
      writeToStorage(key, getSnapshot(key).filter((item) => item !== word))
    },
    [key]
  )

  const has = useCallback((word: string) => items.includes(word), [items])

  return { items, add, remove, has }
}
