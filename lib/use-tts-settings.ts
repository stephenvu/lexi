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

export const DEFAULT_TTS_REPEAT_COUNT = 6
export const DEFAULT_TTS_PAUSE_SECONDS = 3

export type TtsSettings = {
  /** How many times the flashcard Speaker button repeats a word's
   * pronunciation per toggle-on. */
  repeatCount: number
  /** Seconds of silence between each repeat. */
  pauseSeconds: number
  setRepeatCount: (count: number) => void
  setPauseSeconds: (seconds: number) => void
  isLoading: boolean
}

/**
 * The signed-in user's flashcard repeat-playback preferences, stored as
 * the `ttsRepeatCount`/`ttsPauseSeconds` fields on the same users/{uid}
 * Firestore doc saved words/history/srsCards/targetLanguage/lastStudyDeck
 * already live on (see lib/use-user-doc.ts) — same shared-subscription
 * mechanism as lib/use-target-language.ts, just two scalar values instead
 * of one.
 */
export function useTtsSettings(): TtsSettings {
  const { user } = useAuth()
  const uid = user?.uid ?? null

  const userDoc = useSyncExternalStore(
    useCallback((listener: () => void) => subscribeToUserDoc(uid, listener), [uid]),
    useCallback(() => getUserDocSnapshot(uid), [uid]),
    () => EMPTY_USER_DOC
  )

  const setRepeatCount = useCallback(
    (count: number) => {
      if (!uid) return
      writeUserDocFields(uid, { ttsRepeatCount: count })
    },
    [uid]
  )

  const setPauseSeconds = useCallback(
    (seconds: number) => {
      if (!uid) return
      writeUserDocFields(uid, { ttsPauseSeconds: seconds })
    },
    [uid]
  )

  return {
    repeatCount: userDoc.ttsRepeatCount ?? DEFAULT_TTS_REPEAT_COUNT,
    pauseSeconds: userDoc.ttsPauseSeconds ?? DEFAULT_TTS_PAUSE_SECONDS,
    setRepeatCount,
    setPauseSeconds,
    isLoading: uid !== null && !isUserDocLoaded(uid),
  }
}
