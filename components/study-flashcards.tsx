"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GraduationCapIcon,
  RotateCcwIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import type { DefinitionResult } from "@/lib/gemini"
import { usePersistedList } from "@/lib/use-persisted-list"

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

type DeckState =
  | { status: "loading" }
  | { status: "ready"; deck: DefinitionResult[] }

export function StudyFlashcards() {
  const favorites = usePersistedList("lexi.favorites")
  // Derived directly from favorites, not stored in state — there's nothing
  // to fetch when there are no favorites, so this needs no effect at all.
  const isEmpty = favorites.items.length === 0
  const [deckState, setDeckState] = useState<DeckState>({ status: "loading" })
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)

  // Pre-fetch every favorited word's (already-cached) definition, then
  // shuffle. The setState below happens after the await, inside the
  // resolved-promise callback — not synchronously in the effect body — so
  // this is the sanctioned data-fetching pattern, not the
  // setState-in-effect anti-pattern.
  useEffect(() => {
    if (isEmpty) return // nothing to fetch; the empty state renders directly from favorites.items

    let cancelled = false

    async function loadDeck() {
      const results = await Promise.all(
        favorites.items.map(async (word) => {
          try {
            const response = await fetch(`/api/define?word=${encodeURIComponent(word)}`)
            const body = await response.json()
            return body.status === "ok" ? (body.data as DefinitionResult) : null
          } catch {
            return null
          }
        })
      )

      if (cancelled) return

      // Defensive: a favorited word's cache doc should always be found:true
      // (favoriting only happens from a successful result), but don't let
      // an unexpected miss break the whole deck.
      const valid = results.filter((result): result is DefinitionResult => result?.found === true)
      setDeckState({ status: "ready", deck: shuffle(valid) })
      setIndex(0)
      setFlipped(false)
    }

    loadDeck()

    return () => {
      cancelled = true
    }
  }, [favorites.items, isEmpty])

  function restart() {
    if (deckState.status !== "ready") return
    setDeckState({ status: "ready", deck: shuffle(deckState.deck) })
    setIndex(0)
    setFlipped(false)
  }

  function next() {
    setFlipped(false)
    setIndex((current) => current + 1)
  }

  function previous() {
    setFlipped(false)
    setIndex((current) => Math.max(0, current - 1))
  }

  const card = !isEmpty && deckState.status === "ready" ? deckState.deck[index] : null
  const finished = !isEmpty && deckState.status === "ready" && index >= deckState.deck.length

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Study</h1>
        <Button variant="ghost" size="sm" render={<Link href="/" />} nativeButton={false}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back to search
        </Button>
      </div>

      {!isEmpty && deckState.status === "loading" && <Skeleton className="h-48 w-full" />}

      {isEmpty && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GraduationCapIcon />
            </EmptyMedia>
            <EmptyTitle>No favorites yet</EmptyTitle>
            <EmptyDescription>
              Favorite a word from a lookup to start building your flashcard deck.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link href="/" />} nativeButton={false}>Go look something up</Button>
          </EmptyContent>
        </Empty>
      )}

      {card && !finished && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                {card.word}
                {card.cefrLevel && <Badge variant="outline">{card.cefrLevel}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-32 flex-col gap-2">
              {flipped ? (
                <>
                  <Badge variant="secondary">{card.entries[0].partOfSpeech}</Badge>
                  <p>{card.entries[0].definition}</p>
                  {card.entries[0].translatedDefinition && (
                    <p className="text-sm text-muted-foreground">
                      {card.entries[0].translatedWord
                        ? `${card.entries[0].translatedWord} — ${card.entries[0].translatedDefinition}`
                        : card.entries[0].translatedDefinition}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground italic">
                    &ldquo;{card.entries[0].example}&rdquo;
                  </p>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setFlipped(true)}
                  className="cursor-pointer self-start text-sm text-muted-foreground underline underline-offset-4"
                >
                  Click to reveal
                </button>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" size="sm" onClick={previous} disabled={index === 0}>
              <ChevronLeftIcon data-icon="inline-start" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              {index + 1} / {deckState.status === "ready" ? deckState.deck.length : 0}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={next}>
              Next
              <ChevronRightIcon data-icon="inline-end" />
            </Button>
          </div>
        </>
      )}

      {finished && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GraduationCapIcon />
            </EmptyMedia>
            <EmptyTitle>
              You&rsquo;ve reviewed all {deckState.status === "ready" ? deckState.deck.length : 0} words
            </EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" onClick={restart}>
              <RotateCcwIcon data-icon="inline-start" />
              Restart
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </div>
  )
}
