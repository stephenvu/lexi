"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  GraduationCapIcon,
  RotateCcwIcon,
  Volume2Icon,
} from "lucide-react"

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
import { Spinner } from "@/components/ui/spinner"
import type { DefinitionResult } from "@/lib/gemini"
import { usePersistedList } from "@/lib/use-persisted-list"
import { useSpeech } from "@/lib/use-speech"
import { capitalizeFirstLetter } from "@/lib/utils"

// Renders a translation's ISO 639-1 "lang" code (e.g. "vi") as a display
// name (e.g. "Vietnamese") — no hardcoded name-lookup table needed.
const languageDisplayNames = new Intl.DisplayNames(["en"], { type: "language" })

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
  const { isSpeaking, speak } = useSpeech()

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
      <h1 className="text-[34px] leading-[41px] font-bold tracking-[-0.4px]">Study</h1>

      {!isEmpty && deckState.status === "loading" && (
        <Card>
          <CardContent className="flex flex-col gap-3.5">
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      )}

      {isEmpty && (
        <Empty>
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
            <CardContent className="flex min-h-[300px] flex-col gap-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  {card.entries[0].partOfSpeech}
                </span>
                {card.cefrLevel && <Badge variant="secondary">{card.cefrLevel}</Badge>}
              </div>

              {flipped ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-baseline gap-2">
                      <span className="font-heading text-[30px] leading-tight font-bold">
                        {capitalizeFirstLetter(card.word)}
                      </span>
                      {card.ipa && (
                        <span className="font-mono text-sm text-muted-foreground">{card.ipa}</span>
                      )}
                      {card.syllables && (
                        <span className="text-sm text-muted-foreground">{card.syllables}</span>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="glass"
                      size="icon"
                      className="size-11 shrink-0"
                      onClick={() => speak(card.word)}
                      aria-label={`Play pronunciation of ${card.word}`}
                    >
                      {isSpeaking ? <Spinner /> : <Volume2Icon />}
                    </Button>
                  </div>

                  <div className="flex flex-col gap-4 border-t border-[rgba(60,60,67,0.16)] pt-4">
                    <p>{card.entries[0].definition}</p>

                    {card.entries[0].translations.map((translation) => (
                      <div
                        key={translation.lang}
                        className="flex flex-col gap-1 rounded-[18px] bg-[rgba(118,118,128,0.1)] p-4"
                      >
                        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                          {languageDisplayNames.of(translation.lang) ?? translation.lang}
                        </span>
                        <p className="text-sm">
                          {translation.word && (
                            <span className="font-semibold">
                              {capitalizeFirstLetter(translation.word)}
                              {" — "}
                            </span>
                          )}
                          {translation.meaning}
                        </p>
                      </div>
                    ))}

                    <div className="flex flex-col gap-1 rounded-[18px] bg-[rgba(118,118,128,0.1)] p-4">
                      <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                        Example
                      </span>
                      <p className="text-sm italic">&ldquo;{card.entries[0].example}&rdquo;</p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 py-6 text-center">
                  <span className="font-heading text-[44px] leading-tight font-bold">
                    {capitalizeFirstLetter(card.word)}
                  </span>
                  {card.ipa && (
                    <span className="font-mono text-muted-foreground">{card.ipa}</span>
                  )}
                  {card.syllables && (
                    <span className="text-muted-foreground">{card.syllables}</span>
                  )}
                  <Button
                    type="button"
                    variant="glass"
                    size="icon"
                    className="size-[52px]"
                    onClick={() => speak(card.word)}
                    aria-label={`Play pronunciation of ${card.word}`}
                  >
                    {isSpeaking ? <Spinner /> : <Volume2Icon />}
                  </Button>
                  <Button
                    type="button"
                    variant="glass"
                    className="mt-4 w-full rounded-full text-foreground"
                    onClick={() => setFlipped(true)}
                  >
                    Tap to reveal
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <Button type="button" variant="glass" size="sm" className="rounded-full px-4 text-foreground" onClick={previous} disabled={index === 0}>
              <ChevronLeftIcon data-icon="inline-start" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              {index + 1} / {deckState.status === "ready" ? deckState.deck.length : 0}
            </span>
            <Button type="button" variant="glass" size="sm" className="rounded-full px-4 text-foreground" onClick={next}>
              Next
              <ChevronRightIcon data-icon="inline-end" />
            </Button>
          </div>
        </>
      )}

      {finished && (
        <Empty>
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
