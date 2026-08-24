"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { GraduationCapIcon, Volume2Icon } from "lucide-react"
import { Rating, type Grade } from "ts-fsrs"

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
import { useSrsCards, type SrsCards } from "@/lib/use-srs-cards"
import { useSpeech } from "@/lib/use-speech"
import { capitalizeFirstLetter } from "@/lib/utils"

// Renders a translation's ISO 639-1 "lang" code (e.g. "vi") as a display
// name (e.g. "Vietnamese") — no hardcoded name-lookup table needed.
const languageDisplayNames = new Intl.DisplayNames(["en"], { type: "language" })
const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

const RATING_BUTTONS = [
  { rating: Rating.Again, label: "Again" },
  { rating: Rating.Hard, label: "Hard" },
  { rating: Rating.Good, label: "Good" },
  { rating: Rating.Easy, label: "Easy" },
] as const

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// The coarsest unit that still reads as a whole number ("3d" not "0.1mo") —
// shared by the compact rating-button labels and the "next review" message.
function biggestUnit(ms: number): { unit: Intl.RelativeTimeFormatUnit; value: number } {
  const minutes = ms / 60_000
  if (minutes < 60) return { unit: "minute", value: Math.max(1, Math.round(minutes)) }
  const hours = minutes / 60
  if (hours < 24) return { unit: "hour", value: Math.round(hours) }
  const days = hours / 24
  if (days < 30) return { unit: "day", value: Math.round(days) }
  const months = days / 30
  if (months < 12) return { unit: "month", value: Math.round(months) }
  return { unit: "year", value: Math.round(months / 12) }
}

const SHORT_UNIT: Record<Intl.RelativeTimeFormatUnit, string> = {
  minute: "m",
  minutes: "m",
  hour: "h",
  hours: "h",
  day: "d",
  days: "d",
  month: "mo",
  months: "mo",
  year: "y",
  years: "y",
  second: "s",
  seconds: "s",
  quarter: "q",
  quarters: "q",
  week: "w",
  weeks: "w",
}

// Compact label for a rating button, e.g. "3d".
function formatShortInterval(from: Date, to: Date): string {
  const { unit, value } = biggestUnit(Math.max(0, to.getTime() - from.getTime()))
  return `${value}${SHORT_UNIT[unit]}`
}

// Full phrase for the "all caught up" message, e.g. "in 3 days"/"tomorrow".
function formatRelative(from: Date, to: Date): string {
  const { unit, value } = biggestUnit(to.getTime() - from.getTime())
  return relativeTime.format(value, unit)
}

function earliestDue(words: string[], getCard: SrsCards["getCard"]): Date | null {
  if (words.length === 0) return null
  return new Date(Math.min(...words.map((word) => getCard(word).due.getTime())))
}

type ViewState =
  | { status: "loading" }
  | { status: "all-caught-up" }
  | { status: "reviewing"; queue: DefinitionResult[]; index: number }

export function StudyFlashcards() {
  const favorites = usePersistedList("lexi.favorites")
  const srsCards = useSrsCards()
  // Derived directly from favorites, not stored in state — there's nothing
  // to fetch when there are no favorites, so this needs no effect at all.
  const isEmpty = favorites.items.length === 0
  const [viewState, setViewState] = useState<ViewState>({ status: "loading" })
  const [flipped, setFlipped] = useState(false)
  const { isSpeaking, speak } = useSpeech()

  // Read inside the deck-loading effect without making it reactive to
  // every card-state change — rating a card writes to the SRS store, which
  // would otherwise re-trigger this effect and re-fetch/reshuffle mid
  // session. Only favorites (add/remove a word) should do that; getCard
  // itself is read fresh at rating-time directly from srsCards, not through
  // this ref. Updated in its own effect (not directly in the render body)
  // since refs aren't meant to be written during render.
  const getCardRef = useRef(srsCards.getCard)
  useEffect(() => {
    getCardRef.current = srsCards.getCard
  }, [srsCards.getCard])

  // Pre-fetch every favorited word's (already-cached) definition, then
  // keep only what's actually due today. The setState below happens after
  // the await, inside the resolved-promise callback — not synchronously in
  // the effect body — so this is the sanctioned data-fetching pattern, not
  // the setState-in-effect anti-pattern.
  useEffect(() => {
    if (isEmpty) return // nothing to fetch; the empty state renders directly from favorites.items

    // A real AbortController (not just a boolean flag) so React Strict
    // Mode's dev-only double-invoke of effects genuinely cancels the first
    // invocation's in-flight requests instead of just ignoring their
    // result — see the identical fix/comment in components/word-detail.tsx.
    const controller = new AbortController()

    async function loadDeck() {
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

      // Defensive: a favorited word's cache doc should always be found:true
      // (favoriting only happens from a successful result), but don't let
      // an unexpected miss break the whole deck.
      const valid = results.filter((result): result is DefinitionResult => result?.found === true)
      const now = new Date()
      const due = valid.filter((entry) => getCardRef.current(entry.word).due <= now)

      setFlipped(false)
      setViewState(
        due.length > 0
          ? { status: "reviewing", queue: shuffle(due), index: 0 }
          : { status: "all-caught-up" }
      )
    }

    loadDeck()

    return () => {
      controller.abort()
    }
  }, [favorites.items, isEmpty])

  function rate(word: string, rating: Grade) {
    srsCards.rate(word, rating)

    setViewState((current) => {
      if (current.status !== "reviewing") return current
      const nextIndex = current.index + 1
      return nextIndex >= current.queue.length
        ? { status: "all-caught-up" }
        : { ...current, index: nextIndex }
    })
    setFlipped(false)
  }

  const card =
    viewState.status === "reviewing" ? viewState.queue[viewState.index] : null
  const intervals = card ? srsCards.previewIntervals(card.word) : null
  const nextDue =
    viewState.status === "all-caught-up" ? earliestDue(favorites.items, srsCards.getCard) : null

  return (
    <div className="flex w-full flex-col gap-6">
      <h1 className="text-[34px] leading-[41px] font-bold tracking-[-0.4px]">Study</h1>

      {!isEmpty && viewState.status === "loading" && (
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

      {!isEmpty && viewState.status === "all-caught-up" && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GraduationCapIcon />
            </EmptyMedia>
            <EmptyTitle>All caught up</EmptyTitle>
            <EmptyDescription>
              {nextDue
                ? `Nothing due right now — next review ${formatRelative(new Date(), nextDue)}.`
                : "Nothing due right now."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {card && intervals && (
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

          {flipped && (
            <div className="grid grid-cols-4 gap-2">
              {RATING_BUTTONS.map(({ rating, label }) => (
                <Button
                  key={rating}
                  type="button"
                  variant={rating === Rating.Again ? "destructive" : "glass"}
                  className={rating === Rating.Again ? "h-14 flex-col gap-0.5 rounded-2xl" : "h-14 flex-col gap-0.5 rounded-2xl text-foreground"}
                  onClick={() => rate(card.word, rating)}
                >
                  <span className="text-sm font-semibold">{label}</span>
                  <span className="text-xs opacity-70">{formatShortInterval(new Date(), intervals[rating])}</span>
                </Button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
