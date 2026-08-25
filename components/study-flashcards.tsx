"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
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
import { selectWordsToStudy } from "@/lib/deck-study"
import type { DefinitionResult } from "@/lib/gemini"
import { useDecks } from "@/lib/use-decks"
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

const EMPTY_WORDS: string[] = []

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
  const searchParams = useSearchParams()
  const deckId = searchParams.get("deck")

  const favorites = usePersistedList("favorites")
  const { decks, isLoading: decksLoading } = useDecks()
  const srsCards = useSrsCards()

  const deck = deckId ? (decks.find((d) => d.id === deckId) ?? null) : null

  // The word list to study from, and whether it's still loading — differs
  // by source (favorites vs. a specific pre-loaded deck), but everything
  // downstream (due-filtering, the review queue, rating) is identical
  // either way, since SRS scheduling is per-word, not per-source.
  const sourceWords = deckId ? (deck?.words ?? EMPTY_WORDS) : favorites.items
  const sourceLoading = deckId ? decksLoading : favorites.isLoading
  // Favorites has its own "you haven't favorited anything" empty state
  // ("go look something up"), distinct from "nothing due right now." A
  // deck is never in that first state — it either doesn't exist (an
  // invalid ?deck= value) or it has words, handled by deckNotFound below.
  const isEmpty = !deckId && !sourceLoading && sourceWords.length === 0
  const deckNotFound = !!deckId && !decksLoading && !deck

  const [viewState, setViewState] = useState<ViewState>({ status: "loading" })
  const [flipped, setFlipped] = useState(false)
  const { isSpeaking, speak } = useSpeech()

  // deckNotFound is a final, render-only state (folded into "all-caught-up"
  // for display below) rather than something the effect sets via
  // setViewState — that would be a synchronous setState-in-effect call.
  const effectiveStatus = deckNotFound ? "all-caught-up" : viewState.status

  // Read inside the deck-loading effect without making it reactive to
  // every card-state change — rating a card writes to the SRS store, which
  // would otherwise re-trigger this effect and re-fetch/reshuffle mid
  // session. Only the source word list (favorites changing, or the deck
  // resolving) should do that; getCard/hasCard are read fresh at
  // rating/selection-time directly from srsCards, not through these refs.
  // Updated in their own effect (not directly in the render body) since
  // refs aren't meant to be written during render.
  const getCardRef = useRef(srsCards.getCard)
  const hasCardRef = useRef(srsCards.hasCard)
  useEffect(() => {
    getCardRef.current = srsCards.getCard
    hasCardRef.current = srsCards.hasCard
  }, [srsCards.getCard, srsCards.hasCard])

  // Pre-fetch definitions for whatever's actually worth fetching, then (for
  // favorites) narrow to what's due today. The setState below happens
  // after the await, inside the resolved-promise callback — not
  // synchronously in the effect body — so this is the sanctioned
  // data-fetching pattern, not the setState-in-effect anti-pattern.
  useEffect(() => {
    if (isEmpty || deckNotFound) return // nothing to fetch; these render directly, no effect needed
    // Wait for real data before computing anything — srsCards.isLoading
    // isn't in this effect's deps to react to every rating (that's what
    // the refs above are for), but it does need to react to this one
    // loading -> loaded transition, so the queue gets computed against
    // real schedules rather than every word looking freshly due/new.
    if (sourceLoading || srsCards.isLoading) return

    // A real AbortController (not just a boolean flag) so React Strict
    // Mode's dev-only double-invoke of effects genuinely cancels the first
    // invocation's in-flight requests instead of just ignoring their
    // result — see the identical fix/comment in components/word-detail.tsx.
    const controller = new AbortController()

    async function loadDeck() {
      // Favorites: fetch every favorited word, then filter to due below —
      // exactly today's existing, unchanged behavior. A deck: only ever
      // fetch what selectWordsToStudy actually selected (due + a capped
      // number of never-studied words) — fetching an entire multi-
      // thousand-word deck on every visit isn't viable.
      const wordsToFetch = deckId
        ? selectWordsToStudy(sourceWords, {
            hasCard: hasCardRef.current,
            getCard: getCardRef.current,
          })
        : sourceWords

      const results = await Promise.all(
        wordsToFetch.map(async (word) => {
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

      // Defensive: a word's cache doc should always be found:true (a
      // favorite only exists from a successful lookup; a deck word was
      // vetted at upload time), but don't let an unexpected miss break the
      // whole session.
      const valid = results.filter((result): result is DefinitionResult => result?.found === true)
      const now = new Date()
      // Deck mode's wordsToFetch is already exactly the due/new selection
      // — no further filtering needed. Favorites still narrows by due here,
      // unchanged from before.
      const due = deckId ? valid : valid.filter((entry) => getCardRef.current(entry.word).due <= now)

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
  }, [sourceWords, isEmpty, deckNotFound, sourceLoading, srsCards.isLoading, deckId])

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
    effectiveStatus === "all-caught-up" && !deckNotFound
      ? earliestDue(sourceWords, srsCards.getCard)
      : null

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-[34px] leading-[41px] font-bold tracking-[-0.4px]">Study</h1>
        {deck && <p className="text-sm text-muted-foreground">Studying {deck.name}</p>}
      </div>

      {!isEmpty && !deckNotFound && effectiveStatus === "loading" && (
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

      {!isEmpty && effectiveStatus === "all-caught-up" && (
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
