"use client"

import { useEffect, useState } from "react"
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth"

import { auth, googleProvider } from "@/lib/firebase-client"

export type AuthState = {
  user: User | null
  isLoading: boolean
}

/**
 * Wraps Firebase Auth's onAuthStateChanged — a genuine external-system
 * subscription (like components/service-worker-register.tsx's effect),
 * not something useSyncExternalStore's SSR-snapshot machinery is needed
 * for: middleware.ts already gates page loads server-side by session
 * cookie, so this hook is for reading/displaying the signed-in user
 * client-side, not for deciding whether to render at all.
 */
export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setIsLoading(false)
    })
  }, [])

  return { user, isLoading }
}

/**
 * Opens the Google sign-in popup, returns the signed-in user's ID token —
 * app/login/page.tsx exchanges that for a session cookie via /api/session
 * (a separate mechanism from this client-side auth state; see
 * specs/authentication.md).
 */
export async function signInWithGoogle(): Promise<string> {
  const credential = await signInWithPopup(auth, googleProvider)
  return credential.user.getIdToken()
}

export async function signOutUser(): Promise<void> {
  await signOut(auth)
}
