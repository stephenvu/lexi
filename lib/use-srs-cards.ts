"use client"

import { useCallback, useSyncExternalStore } from "react"
import { createEmptyCard, fsrs, Rating, type Card, type Grade } from "ts-fsrs"

const STORAGE_KEY = "lexi.srs"

type Listener = () => void

// Same architecture as lib/use-persisted-list.ts (module-level cache,
// useSyncExternalStore, cross-tab `storage`-event sync), generalized for a
// keyed map of FSRS Card objects instead of a plain string array — there's
// only ever one SRS store, so no per-key parameterization is needed here.
const listeners = new Set<Listener>()
let cache: Record<string, Card> | null = null

// Card.due/last_review are Dates — JSON doesn't round-trip those on its
// own, so they're serialized to ISO strings for storage and revived here.
type SerializedCard = Omit<Card, "due" | "last_review"> & {
  due: string
  last_review: string | null
}

function serialize(card: Card): SerializedCard {
  return {
    ...card,
    due: card.due.toISOString(),
    last_review: card.last_review ? card.last_review.toISOString() : null,
  }
}

function deserialize(serialized: SerializedCard): Card {
  return {
    ...serialized,
    due: new Date(serialized.due),
    last_review: serialized.last_review ? new Date(serialized.last_review) : undefined,
  }
}

function readFromStorage(): Record<string, Card> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, SerializedCard>
    const cards: Record<string, Card> = {}
    for (const [word, serialized] of Object.entries(parsed)) {
      cards[word] = deserialize(serialized)
    }
    return cards
  } catch {
    // Malformed JSON from a previous version, or localStorage inaccessible
    // (private browsing, disabled storage) — treat as empty rather than throw.
    return {}
  }
}

// A single stable reference for the same reason lib/use-persisted-list.ts's
// EMPTY_LIST is — useSyncExternalStore requires getServerSnapshot to return
// the same value across calls.
const EMPTY_CARDS: Record<string, Card> = {}

function getSnapshot(): Record<string, Card> {
  if (typeof window === "undefined") return EMPTY_CARDS
  if (!cache) {
    cache = readFromStorage()
  }
  return cache
}

function getServerSnapshot(): Record<string, Card> {
  return EMPTY_CARDS
}

function notify() {
  listeners.forEach((listener) => listener())
}

function writeToStorage(cards: Record<string, Card>) {
  cache = cards
  try {
    const serialized: Record<string, SerializedCard> = {}
    for (const [word, card] of Object.entries(cards)) {
      serialized[word] = serialize(card)
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized))
  } catch {
    // Storage unavailable/full — the in-memory cache still works for the
    // rest of this session; persistence silently degrades, doesn't crash.
  }
  notify()
}

function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Cross-tab sync: another tab writing this key fires a "storage" event here.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      cache = null // force a re-read from storage on next getSnapshot
      notify()
    }
  })
}

// Single scheduler instance, default parameters — matches this app's
// existing "one module-level client singleton" convention (lib/gemini.ts,
// lib/translate.ts).
const scheduler = fsrs()

export type SrsCards = {
  /** The persisted card for this word, or a freshly-computed (not yet
   * persisted) one if it's never been reviewed — its `due` defaults to
   * "now," so a just-favorited word is immediately due. */
  getCard: (word: string) => Card
  /** The resulting `due` date for each of the 4 ratings, for labeling
   * rating buttons with their outcome before the user picks one. */
  previewIntervals: (word: string) => Record<Grade, Date>
  /** Applies a rating via FSRS, persists and returns the updated card. */
  rate: (word: string, rating: Grade) => Card
  /** Deletes a word's card — call when un-favoriting, so no orphaned
   * scheduling state survives a word leaving the deck. */
  remove: (word: string) => void
}

/**
 * localStorage-backed FSRS card store, one Card per favorited word, shared
 * across hook instances and browser tabs.
 */
export function useSrsCards(): SrsCards {
  const cards = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const getCard = useCallback((word: string) => cards[word] ?? createEmptyCard(), [cards])

  const previewIntervals = useCallback(
    (word: string) => {
      const current = cards[word] ?? createEmptyCard()
      const preview = scheduler.repeat(current, new Date())
      return {
        [Rating.Again]: preview[Rating.Again].card.due,
        [Rating.Hard]: preview[Rating.Hard].card.due,
        [Rating.Good]: preview[Rating.Good].card.due,
        [Rating.Easy]: preview[Rating.Easy].card.due,
      } as Record<Grade, Date>
    },
    [cards]
  )

  const rate = useCallback((word: string, rating: Grade) => {
    const current = getSnapshot()[word] ?? createEmptyCard()
    const { card } = scheduler.next(current, new Date(), rating)
    writeToStorage({ ...getSnapshot(), [word]: card })
    return card
  }, [])

  const remove = useCallback((word: string) => {
    const current = getSnapshot()
    if (!(word in current)) return
    const next = { ...current }
    delete next[word]
    writeToStorage(next)
  }, [])

  return { getCard, previewIntervals, rate, remove }
}
