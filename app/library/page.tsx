"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRightIcon, LibraryIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { selectWordsToStudy } from "@/lib/deck-study"
import type { DefinitionResult } from "@/lib/gemini"
import { signOutUser, useAuth } from "@/lib/use-auth"
import { useDecks } from "@/lib/use-decks"
import { usePersistedList } from "@/lib/use-persisted-list"
import { useSrsCards } from "@/lib/use-srs-cards"
import { capitalizeFirstLetter, cn } from "@/lib/utils"

type Segment = "decks" | "saved"

type SavedState =
  | { status: "loading" }
  | { status: "ready"; words: DefinitionResult[] }

export default function LibraryPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [segment, setSegment] = useState<Segment>("decks")
  const { decks, isLoading: decksLoading } = useDecks()
  const srsCards = useSrsCards()
  const favorites = usePersistedList("favorites")
  // False while favorites is still loading, not just when it's genuinely
  // empty — otherwise a user who does have saved words sees a "No saved
  // words yet" flash before their real data arrives from Firestore.
  const isEmpty = !favorites.isLoading && favorites.items.length === 0
  const [savedState, setSavedState] = useState<SavedState>({ status: "loading" })

  async function handleSignOut() {
    await signOutUser()
    await fetch("/api/session", { method: "DELETE" })
    router.push("/login")
    router.refresh()
  }

  // Same read-through pattern as the Study deck: favorites are always
  // cached already (favoriting only happens after a successful lookup), so
  // this is just re-fetching already-known data, not billing anything new.
  useEffect(() => {
    if (isEmpty || favorites.isLoading) return

    // A real AbortController (not just a boolean flag) so React Strict
    // Mode's dev-only double-invoke of effects genuinely cancels the first
    // invocation's in-flight requests instead of just ignoring their
    // result — see the identical fix/comment in components/word-detail.tsx.
    const controller = new AbortController()

    async function loadSaved() {
      const results = await Promise.all(
        favorites.items.map(async (word) => {
          try {
            const response = await fetch(`/api/define?word=${encodeURIComponent(word)}`, {
              signal: controller.signal,
            })
            const body = await response.json()
            return body.status === "ok" ? (body.data as DefinitionResult) : null
          } catch {
            return null
          }
        })
      )

      if (controller.signal.aborted) return

      const valid = results.filter((result): result is DefinitionResult => result?.found === true)
      setSavedState({ status: "ready", words: valid })
    }

    loadSaved()

    return () => {
      controller.abort()
    }
  }, [favorites.items, isEmpty, favorites.isLoading])

  return (
    <div className="flex flex-1 items-start justify-center px-4 py-16 sm:py-24">
      <main className="flex w-full max-w-xl flex-col gap-6">
        <h1 className="text-[34px] leading-[41px] font-bold tracking-[-0.4px]">Library</h1>

        <div className="grid grid-cols-2 gap-1 rounded-[21px] border-[0.5px] border-white/70 bg-[color-mix(in_oklch,white_44%,transparent)] p-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_6px_18px_rgba(12,32,24,0.06)] backdrop-blur-2xl backdrop-saturate-[1.8]">
          {(
            [
              { key: "decks", label: "Decks" },
              { key: "saved", label: "Saved" },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSegment(key)}
              className={cn(
                "flex min-h-[38px] items-center justify-center rounded-2xl text-[15px] tracking-tight",
                segment === key
                  ? "bg-[color-mix(in_oklch,white_92%,transparent)] font-semibold text-foreground shadow-[0_2px_6px_rgba(12,32,24,0.1),inset_0_1px_0_rgba(255,255,255,0.9)]"
                  : "font-medium text-muted-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {segment === "decks" && (decksLoading || srsCards.isLoading) && (
          <Card>
            <CardContent className="flex flex-col gap-3.5">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </CardContent>
          </Card>
        )}

        {segment === "decks" && !decksLoading && !srsCards.isLoading && decks.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LibraryIcon />
              </EmptyMedia>
              <EmptyTitle>Coming soon</EmptyTitle>
              <EmptyDescription>
                Pre-loaded study decks are on the way — for now, all your favorites live under Study.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {segment === "decks" && !decksLoading && !srsCards.isLoading && decks.length > 0 && (
          <div className="glass-surface flex flex-col overflow-hidden rounded-[26px]">
            {decks.map((deck, index) => {
              const toStudyCount = selectWordsToStudy(deck.words, srsCards).length
              return (
                <Link
                  key={deck.id}
                  href={`/study?deck=${encodeURIComponent(deck.id)}`}
                  className={cn(
                    "flex min-h-[64px] items-center gap-3 px-[18px] py-3.5",
                    index < decks.length - 1 && "border-b border-[rgba(60,60,67,0.14)]"
                  )}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-heading text-lg font-semibold tracking-tight">
                      {deck.name}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {deck.words.length} cards ·{" "}
                      {toStudyCount > 0 ? `${toStudyCount} to study` : "All caught up"}
                    </span>
                  </div>
                  <ChevronRightIcon className="size-[18px] shrink-0 text-muted-foreground/50" />
                </Link>
              )
            })}
          </div>
        )}

        {segment === "saved" && isEmpty && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LibraryIcon />
              </EmptyMedia>
              <EmptyTitle>No saved words yet</EmptyTitle>
              <EmptyDescription>
                Favorite a word from a lookup and it will show up here.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button render={<Link href="/" />} nativeButton={false}>Go look something up</Button>
            </EmptyContent>
          </Empty>
        )}

        {segment === "saved" && !isEmpty && savedState.status === "loading" && (
          <Card>
            <CardContent className="flex flex-col gap-3.5">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </CardContent>
          </Card>
        )}

        {segment === "saved" && !isEmpty && savedState.status === "ready" && (
          <div className="glass-surface flex flex-col overflow-hidden rounded-[26px]">
            {savedState.words.map((entry, index) => (
              <Link
                key={entry.word}
                href={`/word/${encodeURIComponent(entry.word)}`}
                className={cn(
                  "flex min-h-[60px] items-center gap-3 px-[18px] py-3.5",
                  index < savedState.words.length - 1 && "border-b border-[rgba(60,60,67,0.14)]"
                )}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-heading text-lg font-semibold tracking-tight">
                    {capitalizeFirstLetter(entry.word)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {entry.entries[0]?.partOfSpeech}
                  </span>
                </div>
                {entry.cefrLevel && <Badge variant="secondary">{entry.cefrLevel}</Badge>}
                <ChevronRightIcon className="size-[18px] shrink-0 text-muted-foreground/50" />
              </Link>
            ))}
          </div>
        )}

        {user && (
          <div className="glass-surface flex items-center justify-between gap-3 rounded-[26px] p-4">
            <div className="flex min-w-0 items-center gap-3">
              {user.photoURL && (
                // A plain <img>, not next/image — this is the app's only
                // external-domain image, and configuring remotePatterns
                // for one small avatar isn't worth the extra config.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.photoURL}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="size-10 shrink-0 rounded-full"
                />
              )}
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">
                  {user.displayName ?? "Signed in"}
                </span>
                {user.email && (
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                )}
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}
