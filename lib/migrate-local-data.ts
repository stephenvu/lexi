"use client"

import { doc, getDoc, setDoc } from "firebase/firestore"

import { auth, db } from "@/lib/firebase-client"

const LOCAL_KEYS = {
  favorites: "lexi.favorites",
  history: "lexi.history",
  srsCards: "lexi.srs",
} as const

function readLocalArray(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []
  } catch {
    return []
  }
}

function readLocalSrsCards(): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEYS.srsCards)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === "object" && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * One-time migration from this browser's localStorage into the
 * newly-signed-in user's Firestore doc — only runs when that doc doesn't
 * exist yet (a genuine first sign-in for this account), so an existing
 * cloud user's real data is never clobbered by whatever a browser happens
 * to have locally. Called from app/login/page.tsx right after a
 * successful sign-in, before navigating into the (now cloud-backed) app.
 */
export async function migrateLocalDataToCloud(): Promise<void> {
  const user = auth.currentUser
  if (!user) return

  const userDocRef = doc(db, "users", user.uid)
  const existing = await getDoc(userDocRef)
  if (existing.exists()) return // real cloud data already exists — never overwrite it

  const favorites = readLocalArray(LOCAL_KEYS.favorites)
  const history = readLocalArray(LOCAL_KEYS.history)
  const srsCards = readLocalSrsCards()

  if (favorites.length === 0 && history.length === 0 && Object.keys(srsCards).length === 0) {
    return // nothing local to migrate
  }

  await setDoc(userDocRef, { favorites, history, srsCards })

  window.localStorage.removeItem(LOCAL_KEYS.favorites)
  window.localStorage.removeItem(LOCAL_KEYS.history)
  window.localStorage.removeItem(LOCAL_KEYS.srsCards)
}
