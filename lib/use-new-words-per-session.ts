"use client"

import { useCallback, useSyncExternalStore } from "react"

import { NEW_WORDS_PER_SESSION } from "@/lib/deck-study"
import { useAuth } from "@/lib/use-auth"
import {
  EMPTY_USER_DOC,
  getUserDocSnapshot,
  isUserDocLoaded,
  subscribeToUserDoc,
  writeUserDocFields,
} from "@/lib/use-user-doc"

export const DEFAULT_NEW_WORDS_PER_SESSION = NEW_WORDS_PER_SESSION

export type NewWordsPerSessionSettings = {
  /** How many never-before-seen words lib/deck-study.ts's
   * selectWordsToStudy introduces per Study visit to a pre-loaded deck
   * (Saved words is unaffected — it's always uncapped). */
  newWordsPerSession: number
  setNewWordsPerSession: (count: number) => void
  isLoading: boolean
}

/**
 * The signed-in user's new-words-per-session preference, stored as the
 * `newWordsPerSession` field on the same users/{uid} Firestore doc every
 * other Study setting lives on (see lib/use-user-doc.ts) — same shared-
 * subscription mechanism as lib/use-rating-button-count.ts.
 */
export function useNewWordsPerSession(): NewWordsPerSessionSettings {
  const { user } = useAuth()
  const uid = user?.uid ?? null

  const userDoc = useSyncExternalStore(
    useCallback((listener: () => void) => subscribeToUserDoc(uid, listener), [uid]),
    useCallback(() => getUserDocSnapshot(uid), [uid]),
    () => EMPTY_USER_DOC
  )

  const setNewWordsPerSession = useCallback(
    (count: number) => {
      if (!uid) return
      writeUserDocFields(uid, { newWordsPerSession: count })
    },
    [uid]
  )

  return {
    newWordsPerSession: userDoc.newWordsPerSession ?? DEFAULT_NEW_WORDS_PER_SESSION,
    setNewWordsPerSession,
    isLoading: uid !== null && !isUserDocLoaded(uid),
  }
}
