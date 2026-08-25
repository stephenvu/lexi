"use client"

import { useCallback, useSyncExternalStore } from "react"

import { useAuth } from "@/lib/use-auth"
import {
  EMPTY_USER_DOC,
  getUserDocSnapshot,
  isUserDocLoaded,
  subscribeToUserDoc,
  writeUserDocFields,
} from "@/lib/use-user-doc"

// "saved" is the virtual deck id for the user's own saved words (see
// components/study-flashcards.tsx) — also the default here, so a user who
// has never chosen anything gets exactly today's original behavior.
export const SAVED_DECK_ID = "saved"

export type LastStudyDeck = {
  /** The deck id (a real decks/{id}, or SAVED_DECK_ID) the user last
   * studied — SAVED_DECK_ID until they've explicitly chosen another deck. */
  lastStudyDeck: string
  setLastStudyDeck: (deckId: string) => void
  isLoading: boolean
}

/**
 * Remembers which deck the signed-in user last studied, so visiting
 * `/study` with no `?deck=` resumes it instead of always defaulting to
 * saved words. Stored as the `lastStudyDeck` field on the same
 * users/{uid} Firestore doc saved words/history/srsCards/targetLanguage
 * already live on — same shared-subscription mechanism as
 * lib/use-persisted-list.ts and lib/use-target-language.ts.
 */
export function useLastStudyDeck(): LastStudyDeck {
  const { user } = useAuth()
  const uid = user?.uid ?? null

  const userDoc = useSyncExternalStore(
    useCallback((listener: () => void) => subscribeToUserDoc(uid, listener), [uid]),
    useCallback(() => getUserDocSnapshot(uid), [uid]),
    () => EMPTY_USER_DOC
  )

  const setLastStudyDeck = useCallback(
    (deckId: string) => {
      if (!uid) return
      writeUserDocFields(uid, { lastStudyDeck: deckId })
    },
    [uid]
  )

  return {
    lastStudyDeck: userDoc.lastStudyDeck ?? SAVED_DECK_ID,
    setLastStudyDeck,
    isLoading: uid !== null && !isUserDocLoaded(uid),
  }
}
