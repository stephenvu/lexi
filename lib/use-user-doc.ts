"use client"

import { doc, onSnapshot, setDoc } from "firebase/firestore"

import { db } from "@/lib/firebase-client"

export type UserDoc = {
  favorites?: string[]
  history?: string[]
  srsCards?: Record<string, unknown>
  targetLanguage?: string
  lastStudyDeck?: string
  ttsRepeatCount?: number
  ttsPauseSeconds?: number
  ratingButtonCount?: number
}

type Listener = () => void

// Module-level, keyed by uid — shared by every hook that reads/writes a
// field on users/{uid} (lib/use-persisted-list.ts, lib/use-srs-cards.ts),
// so a signed-in user gets exactly one Firestore realtime listener no
// matter how many of those hooks/fields are in use at once. Same
// shared-cache-plus-listeners shape lib/use-persisted-list.ts always had
// for localStorage; here it fronts a Firestore doc instead.
const listeners = new Map<string, Set<Listener>>()
const cache = new Map<string, UserDoc>()
const loadedUids = new Set<string>()
const unsubscribers = new Map<string, () => void>()

export const EMPTY_USER_DOC: UserDoc = {}

function notify(uid: string) {
  listeners.get(uid)?.forEach((listener) => listener())
}

// Firestore hands back a brand-new object graph (arrays, nested maps) on
// every snapshot, even for fields whose value didn't actually change — so
// naively caching snapshot.data() as-is gives every field a new reference
// on every write to this doc, not just the field that was actually
// written. That breaks anything downstream that depends on a field's
// reference staying stable across unrelated writes — e.g.
// components/study-flashcards.tsx's deck-loading effect, keyed on
// `favorites`, which would otherwise reshuffle and re-fetch the whole
// study queue after every single flashcard rating (a `srsCards`-only
// write touches this same shared doc). Reusing the previous value's
// reference per-field when its content is unchanged fixes that at the
// source, for every consumer of this doc.
function mergeUnchangedFields(previous: UserDoc | undefined, next: UserDoc): UserDoc {
  if (!previous) return next
  const merged: Record<string, unknown> = { ...next }
  for (const key of Object.keys(next)) {
    const prevValue = (previous as Record<string, unknown>)[key]
    if (
      prevValue !== undefined &&
      JSON.stringify(prevValue) === JSON.stringify((next as Record<string, unknown>)[key])
    ) {
      merged[key] = prevValue
    }
  }
  return merged as UserDoc
}

function ensureSubscription(uid: string) {
  if (unsubscribers.has(uid)) return
  const ref = doc(db, "users", uid)
  const unsubscribe = onSnapshot(
    ref,
    (snapshot) => {
      const next = (snapshot.data() as UserDoc | undefined) ?? {}
      cache.set(uid, mergeUnchangedFields(cache.get(uid), next))
      loadedUids.add(uid)
      notify(uid)
    },
    (error) => {
      // Most likely a signed-out/mid-transition read denied by
      // firestore.rules — treat as "loaded, empty" rather than leaving
      // consumers stuck on a loading state forever.
      console.error(`Failed to subscribe to user doc "${uid}":`, error)
      loadedUids.add(uid)
      notify(uid)
    }
  )
  unsubscribers.set(uid, unsubscribe)
}

export function subscribeToUserDoc(uid: string | null, listener: Listener) {
  if (!uid) return () => {}
  ensureSubscription(uid)
  if (!listeners.has(uid)) listeners.set(uid, new Set())
  listeners.get(uid)!.add(listener)
  return () => listeners.get(uid)?.delete(listener)
}

export function getUserDocSnapshot(uid: string | null): UserDoc {
  if (!uid) return EMPTY_USER_DOC
  return cache.get(uid) ?? EMPTY_USER_DOC
}

export function isUserDocLoaded(uid: string | null): boolean {
  return uid !== null && loadedUids.has(uid)
}

/**
 * Merges the given fields into the signed-in user's doc (creating it if
 * this is their first write). Updates the local cache optimistically
 * before the write resolves, so add/remove/rate feel instant rather than
 * waiting on a round-trip — Firestore's own listener reconciles shortly
 * after with the server-confirmed value.
 */
export async function writeUserDocFields(uid: string, fields: Partial<UserDoc>): Promise<void> {
  const current = cache.get(uid) ?? {}
  cache.set(uid, { ...current, ...fields })
  notify(uid)

  try {
    await setDoc(doc(db, "users", uid), fields, { merge: true })
  } catch (error) {
    console.error(`Failed to save user data for "${uid}":`, error)
  }
}
