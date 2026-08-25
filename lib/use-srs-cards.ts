"use client"

import { useCallback, useSyncExternalStore } from "react"
import { Timestamp } from "firebase/firestore"
import { createEmptyCard, fsrs, Rating, type Card, type Grade } from "ts-fsrs"

import { useAuth } from "@/lib/use-auth"
import {
  EMPTY_USER_DOC,
  getUserDocSnapshot,
  isUserDocLoaded,
  subscribeToUserDoc,
  writeUserDocFields,
} from "@/lib/use-user-doc"

// Card.due/last_review are Dates. Firestore stores Dates as Timestamps
// natively on write (no manual ISO-string round-tripping the way
// localStorage needed), but hands back Timestamp instances on read, so
// those need converting back to real Dates for ts-fsrs to use.
function toDate(value: unknown): Date {
  return value instanceof Timestamp ? value.toDate() : new Date(value as string)
}

function fromFirestoreCard(data: Record<string, unknown>): Card {
  return {
    ...data,
    due: toDate(data.due),
    last_review: data.last_review ? toDate(data.last_review) : undefined,
  } as Card
}

// Single scheduler instance, default parameters — matches this app's
// existing "one module-level client singleton" convention (lib/gemini.ts,
// lib/translate.ts).
const scheduler = fsrs()

// A stable reference for when srsCards is absent — a fresh `{}` literal
// every render would make getCard's useCallback dep look like it changed
// every time even when nothing did.
const EMPTY_CARDS: Record<string, unknown> = {}

export type SrsCards = {
  /** The persisted card for this word, or a freshly-computed (not yet
   * persisted) one if it's never been reviewed — its `due` defaults to
   * "now," so a just-saved word is immediately due. */
  getCard: (word: string) => Card
  /** Whether this word has a real stored schedule — `getCard` can't tell
   * you this on its own, since it falls back to a fresh (but unpersisted)
   * card for a word that's never been reviewed. Used to distinguish
   * "genuinely new" from "has a real due date" when sourcing a large
   * pre-loaded deck (see lib/deck-study.ts) rather than saved words. */
  hasCard: (word: string) => boolean
  /** The resulting `due` date for each of the 4 ratings, for labeling
   * rating buttons with their outcome before the user picks one. */
  previewIntervals: (word: string) => Record<Grade, Date>
  /** Applies a rating via FSRS, persists and returns the updated card. */
  rate: (word: string, rating: Grade) => Card
  /** Deletes a word's card — call when un-saving, so no orphaned
   * scheduling state survives a word leaving the deck. */
  remove: (word: string) => void
  isLoading: boolean
}

/**
 * FSRS card store, one Card per saved word, stored as the `srsCards`
 * field on the signed-in user's users/{uid} Firestore doc (the same doc
 * lib/use-persisted-list.ts's saved words/history live on, via
 * lib/use-user-doc.ts's shared subscription) — synced in real time across
 * every tab/device signed into the same account.
 */
export function useSrsCards(): SrsCards {
  const { user } = useAuth()
  const uid = user?.uid ?? null

  const userDoc = useSyncExternalStore(
    useCallback((listener: () => void) => subscribeToUserDoc(uid, listener), [uid]),
    useCallback(() => getUserDocSnapshot(uid), [uid]),
    () => EMPTY_USER_DOC
  )

  const cards = userDoc.srsCards ?? EMPTY_CARDS

  const getCard = useCallback(
    (word: string) => {
      const stored = cards[word]
      return stored ? fromFirestoreCard(stored as Record<string, unknown>) : createEmptyCard()
    },
    [cards]
  )

  const hasCard = useCallback((word: string) => word in cards, [cards])

  const previewIntervals = useCallback(
    (word: string) => {
      const current = getCard(word)
      const preview = scheduler.repeat(current, new Date())
      return {
        [Rating.Again]: preview[Rating.Again].card.due,
        [Rating.Hard]: preview[Rating.Hard].card.due,
        [Rating.Good]: preview[Rating.Good].card.due,
        [Rating.Easy]: preview[Rating.Easy].card.due,
      } as Record<Grade, Date>
    },
    [getCard]
  )

  const rate = useCallback(
    (word: string, rating: Grade) => {
      if (!uid) return createEmptyCard()
      const current = getCard(word)
      const { card } = scheduler.next(current, new Date(), rating)
      const currentCards = (getUserDocSnapshot(uid).srsCards ?? {}) as Record<string, unknown>
      writeUserDocFields(uid, { srsCards: { ...currentCards, [word]: { ...card } } })
      return card
    },
    [uid, getCard]
  )

  const remove = useCallback(
    (word: string) => {
      if (!uid) return
      const currentCards = { ...(getUserDocSnapshot(uid).srsCards ?? {}) } as Record<string, unknown>
      if (!(word in currentCards)) return
      delete currentCards[word]
      writeUserDocFields(uid, { srsCards: currentCards })
    },
    [uid]
  )

  return {
    getCard,
    hasCard,
    previewIntervals,
    rate,
    remove,
    isLoading: uid !== null && !isUserDocLoaded(uid),
  }
}
