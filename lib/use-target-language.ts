"use client"

import { useCallback, useSyncExternalStore } from "react"

import { DEFAULT_TARGET_LANGUAGE } from "@/lib/languages"
import { useAuth } from "@/lib/use-auth"
import {
  EMPTY_USER_DOC,
  getUserDocSnapshot,
  isUserDocLoaded,
  subscribeToUserDoc,
  writeUserDocFields,
} from "@/lib/use-user-doc"

export type TargetLanguage = {
  /** The signed-in user's Settings preference — "en" (meaning "no
   * translation shown," since English is the dictionary's own source
   * language) until they've explicitly picked something else. */
  targetLanguage: string
  setTargetLanguage: (code: string) => void
  isLoading: boolean
}

/**
 * The signed-in user's preferred bilingual-translation target language,
 * stored as the `targetLanguage` field on the same users/{uid} Firestore
 * doc favorites/history/srsCards already live on (see
 * lib/use-user-doc.ts) — same shared-subscription mechanism as
 * lib/use-persisted-list.ts, just a single string value instead of a list.
 */
export function useTargetLanguage(): TargetLanguage {
  const { user } = useAuth()
  const uid = user?.uid ?? null

  const userDoc = useSyncExternalStore(
    useCallback((listener: () => void) => subscribeToUserDoc(uid, listener), [uid]),
    useCallback(() => getUserDocSnapshot(uid), [uid]),
    () => EMPTY_USER_DOC
  )

  const setTargetLanguage = useCallback(
    (code: string) => {
      if (!uid) return
      writeUserDocFields(uid, { targetLanguage: code })
    },
    [uid]
  )

  return {
    targetLanguage: userDoc.targetLanguage ?? DEFAULT_TARGET_LANGUAGE,
    setTargetLanguage,
    isLoading: uid !== null && !isUserDocLoaded(uid),
  }
}
