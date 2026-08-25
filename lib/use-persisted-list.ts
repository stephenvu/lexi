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

const EMPTY_ITEMS: string[] = []

export type PersistedList = {
  items: string[]
  add: (word: string) => void
  remove: (word: string) => void
  has: (word: string) => boolean
  isLoading: boolean
}

/**
 * A list of strings, most-recently-added first, stored as a field on the
 * signed-in user's users/{uid} Firestore doc and synced in real time
 * across every tab/device signed into the same account. Used for both
 * search history (capped) and saved words (uncapped) — same mechanism,
 * different field/cap. `field` is the actual Firestore field name, not
 * just a label — "favorites" stays as-is even though every user-facing
 * surface now calls this "Saved," to avoid a data migration for a
 * purely-cosmetic rename. Access is enforced by firestore.rules
 * (owner-only); there's no signed-out fallback since the whole app
 * requires sign-in (see proxy.ts).
 */
export function usePersistedList(
  field: "favorites" | "history",
  options?: { cap?: number }
): PersistedList {
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const cap = options?.cap

  const userDoc = useSyncExternalStore(
    useCallback((listener: () => void) => subscribeToUserDoc(uid, listener), [uid]),
    useCallback(() => getUserDocSnapshot(uid), [uid]),
    () => EMPTY_USER_DOC
  )

  const items = userDoc[field] ?? EMPTY_ITEMS

  const add = useCallback(
    (word: string) => {
      if (!uid) return
      const current = getUserDocSnapshot(uid)[field] ?? []
      const deduped = [word, ...current.filter((item) => item !== word)]
      writeUserDocFields(uid, { [field]: cap ? deduped.slice(0, cap) : deduped })
    },
    [uid, field, cap]
  )

  const remove = useCallback(
    (word: string) => {
      if (!uid) return
      const current = getUserDocSnapshot(uid)[field] ?? []
      writeUserDocFields(uid, { [field]: current.filter((item) => item !== word) })
    },
    [uid, field]
  )

  const has = useCallback((word: string) => items.includes(word), [items])

  return { items, add, remove, has, isLoading: uid !== null && !isUserDocLoaded(uid) }
}
