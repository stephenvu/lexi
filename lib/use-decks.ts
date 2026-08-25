"use client"

import { useEffect, useState } from "react"
import { collection, getDocs } from "firebase/firestore"

import { db } from "@/lib/firebase-client"
import { useAuth } from "@/lib/use-auth"

export type Deck = {
  id: string
  name: string
  words: string[]
}

export type Decks = {
  decks: Deck[]
  isLoading: boolean
}

/**
 * Fetches every pre-loaded deck (decks/{deckId} — see
 * scripts/upload-deck.mjs) once per mount, not a live listener: deck
 * content only ever changes via that admin script, so there's no need to
 * subscribe the way lib/use-user-doc.ts does for per-user data.
 */
export function useDecks(): Decks {
  const { user, isLoading: authLoading } = useAuth()
  const [decks, setDecks] = useState<Deck[]>([])
  const [hasFetched, setHasFetched] = useState(false)

  useEffect(() => {
    if (authLoading || !user) return // nothing to fetch yet — isLoading below reflects this

    let cancelled = false

    getDocs(collection(db, "decks"))
      .then((snapshot) => {
        if (cancelled) return
        setDecks(
          snapshot.docs.map((doc) => {
            const data = doc.data()
            return {
              id: doc.id,
              name: typeof data.name === "string" ? data.name : doc.id,
              words: Array.isArray(data.words) ? data.words : [],
            }
          })
        )
        setHasFetched(true)
      })
      .catch((error) => {
        if (cancelled) return
        console.error("Failed to load decks:", error)
        setHasFetched(true)
      })

    return () => {
      cancelled = true
    }
  }, [user, authLoading])

  return { decks, isLoading: authLoading || (!!user && !hasFetched) }
}
