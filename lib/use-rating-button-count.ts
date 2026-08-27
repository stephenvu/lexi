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

export const DEFAULT_RATING_BUTTON_COUNT = 2

export type RatingButtonCount = 2 | 4

export type RatingButtonCountSettings = {
  /** How many FSRS rating buttons a flashcard shows on flip: 2
   * (Again/Good only) or 4 (Again/Hard/Good/Easy — see RATING_BUTTONS in
   * components/study-flashcards.tsx). Defaults to 2, a simpler pass/fail
   * choice, rather than ts-fsrs's full 4-grade set. */
  ratingButtonCount: RatingButtonCount
  setRatingButtonCount: (count: RatingButtonCount) => void
  isLoading: boolean
}

/**
 * The signed-in user's flashcard rating-button-count preference, stored as
 * the `ratingButtonCount` field on the same users/{uid} Firestore doc
 * saved words/history/srsCards/targetLanguage/lastStudyDeck/tts settings
 * already live on (see lib/use-user-doc.ts) — same shared-subscription
 * mechanism as lib/use-tts-settings.ts.
 */
export function useRatingButtonCount(): RatingButtonCountSettings {
  const { user } = useAuth()
  const uid = user?.uid ?? null

  const userDoc = useSyncExternalStore(
    useCallback((listener: () => void) => subscribeToUserDoc(uid, listener), [uid]),
    useCallback(() => getUserDocSnapshot(uid), [uid]),
    () => EMPTY_USER_DOC
  )

  const setRatingButtonCount = useCallback(
    (count: RatingButtonCount) => {
      if (!uid) return
      writeUserDocFields(uid, { ratingButtonCount: count })
    },
    [uid]
  )

  return {
    // Anything other than exactly 4 (missing, corrupted, or literally 2)
    // collapses to the 2-button default — avoids an unsafe cast while still
    // round-tripping a real 4 correctly.
    ratingButtonCount: userDoc.ratingButtonCount === 4 ? 4 : DEFAULT_RATING_BUTTON_COUNT,
    setRatingButtonCount,
    isLoading: uid !== null && !isUserDocLoaded(uid),
  }
}
