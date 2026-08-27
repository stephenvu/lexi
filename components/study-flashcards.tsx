"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { GraduationCapIcon, TurtleIcon, Volume2Icon } from "lucide-react";
import { Rating, State, type Grade } from "ts-fsrs";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  formatDeckStats,
  getDeckStudyStats,
  selectWordsToStudy,
} from "@/lib/deck-study";
import { fetchCachedDefinition } from "@/lib/definitions-idb-cache";
import type { DefinitionResult } from "@/lib/gemini";
import { useDecks } from "@/lib/use-decks";
import { SAVED_DECK_ID, useLastStudyDeck } from "@/lib/use-last-study-deck";
import { usePersistedList } from "@/lib/use-persisted-list";
import { useRatingButtonCount } from "@/lib/use-rating-button-count";
import { useSrsCards, type SrsCards } from "@/lib/use-srs-cards";
import { useSpeech } from "@/lib/use-speech";
import { useTargetLanguage } from "@/lib/use-target-language";
import { useTtsSettings } from "@/lib/use-tts-settings";
import { capitalizeFirstLetter, shuffle } from "@/lib/utils";

// Renders a translation's ISO 639-1 "lang" code (e.g. "vi") as a display
// name (e.g. "Vietnamese") — no hardcoded name-lookup table needed.
const languageDisplayNames = new Intl.DisplayNames(["en"], {
  type: "language",
});
const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const RATING_BUTTONS = [
  { rating: Rating.Again, label: "Again" },
  { rating: Rating.Hard, label: "Hard" },
  { rating: Rating.Good, label: "Good" },
  { rating: Rating.Easy, label: "Easy" },
] as const;

const EMPTY_WORDS: string[] = [];

const CARD_STATE_LABEL: Record<State, string> = {
  [State.New]: "New",
  [State.Learning]: "Learning",
  [State.Review]: "Review",
  [State.Relearning]: "Relearn",
};

// Playback rate for the flashcard Speaker button's "slow" toggle — fixed,
// not a Settings value (unlike repeat count/pause duration below).
const SLOW_RATE = 0.5;

// A pause between repeats that can be cancelled instantly (rather than
// waiting out the full duration) — resolves early if `cancel()` is called
// before the timeout fires. Used by the repeat-playback loop below.
function cancellableSleep(ms: number) {
  let timeoutId: ReturnType<typeof setTimeout>;
  let resolveEarly: () => void;
  const promise = new Promise<void>((resolve) => {
    resolveEarly = resolve;
    timeoutId = setTimeout(resolve, ms);
  });
  return {
    promise,
    cancel: () => {
      clearTimeout(timeoutId);
      resolveEarly();
    },
  };
}

// The coarsest unit that still reads as a whole number ("3d" not "0.1mo") —
// shared by the compact rating-button labels and the "next review" message.
function biggestUnit(ms: number): {
  unit: Intl.RelativeTimeFormatUnit;
  value: number;
} {
  const minutes = ms / 60_000;
  if (minutes < 60)
    return { unit: "minute", value: Math.max(1, Math.round(minutes)) };
  const hours = minutes / 60;
  if (hours < 24) return { unit: "hour", value: Math.round(hours) };
  const days = hours / 24;
  if (days < 30) return { unit: "day", value: Math.round(days) };
  const months = days / 30;
  if (months < 12) return { unit: "month", value: Math.round(months) };
  return { unit: "year", value: Math.round(months / 12) };
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
};

// Compact label for a rating button, e.g. "3d".
function formatShortInterval(from: Date, to: Date): string {
  const { unit, value } = biggestUnit(
    Math.max(0, to.getTime() - from.getTime()),
  );
  return `${value}${SHORT_UNIT[unit]}`;
}

// Full phrase for the "all caught up" message, e.g. "in 3 days"/"tomorrow".
function formatRelative(from: Date, to: Date): string {
  const { unit, value } = biggestUnit(to.getTime() - from.getTime());
  return relativeTime.format(value, unit);
}

function earliestDue(
  words: string[],
  getCard: SrsCards["getCard"],
): Date | null {
  if (words.length === 0) return null;
  return new Date(
    Math.min(...words.map((word) => getCard(word).due.getTime())),
  );
}

type ViewState =
  | { status: "loading" }
  | { status: "all-caught-up" }
  | { status: "reviewing"; queue: DefinitionResult[]; index: number };

export function StudyFlashcards() {
  const searchParams = useSearchParams();
  const queryDeckId = searchParams.get("deck");

  const saved = usePersistedList("favorites");
  const { decks, isLoading: decksLoading } = useDecks();
  const srsCards = useSrsCards();
  const {
    lastStudyDeck,
    setLastStudyDeck,
    isLoading: lastDeckLoading,
  } = useLastStudyDeck();
  const { targetLanguage, isLoading: languageLoading } = useTargetLanguage();

  // No explicit ?deck= — resume whatever was last studied (defaulting to
  // saved words if nothing's ever been chosen). `null` while that
  // preference is still loading, rather than assuming the default
  // immediately: the fetch effect below waits for this to resolve, so a
  // returning user with a real last-studied deck doesn't briefly fetch
  // saved words before flipping to their actual deck once Firestore
  // catches up (the exact double-fetch problem lib/use-target-language.ts
  // has to guard against too).
  const deckId = queryDeckId ?? (lastDeckLoading ? null : lastStudyDeck);

  // An explicit ?deck= visit is "the user choosing a deck" — record it as
  // the one to resume next time, regardless of how they got here (a
  // Library tap, a direct URL, browser back/forward).
  useEffect(() => {
    if (queryDeckId && queryDeckId !== lastStudyDeck) {
      setLastStudyDeck(queryDeckId);
    }
  }, [queryDeckId, lastStudyDeck, setLastStudyDeck]);

  const isSavedDeck = deckId === SAVED_DECK_ID;
  const deck =
    deckId && !isSavedDeck
      ? (decks.find((d) => d.id === deckId) ?? null)
      : null;

  // The word list to study from, and whether it's still loading — differs
  // by source (saved words vs. a specific pre-loaded deck), but everything
  // downstream (due-filtering, the review queue, rating) is identical
  // either way, since SRS scheduling is per-word, not per-source.
  const sourceWords = isSavedDeck ? saved.items : (deck?.words ?? EMPTY_WORDS);
  const sourceLoading = isSavedDeck ? saved.isLoading : decksLoading;
  // Saved words has its own "you haven't saved anything" empty state ("go
  // look something up"), distinct from "nothing due right now." A deck is
  // never in that first state — it either doesn't exist (an invalid or
  // stale ?deck= value) or it has words, handled by deckNotFound below.
  const isEmpty = isSavedDeck && !sourceLoading && sourceWords.length === 0;
  const deckNotFound = !!deckId && !isSavedDeck && !decksLoading && !deck;

  const [viewState, setViewState] = useState<ViewState>({ status: "loading" });
  const [flipped, setFlipped] = useState(false);
  const { isSpeaking, speak, stop } = useSpeech();
  const { repeatCount, pauseSeconds } = useTtsSettings();
  const { ratingButtonCount } = useRatingButtonCount();

  // Repeat-playback toggle state for the Speaker button, plus the speed
  // toggle next to it. Shared across both card faces (only one is visible
  // at a time), so a single set of state covers both.
  const [isRepeating, setIsRepeating] = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  const cancelledRef = useRef(false);
  const cancelSleepRef = useRef<(() => void) | null>(null);

  const stopRepeat = useCallback(() => {
    cancelledRef.current = true;
    cancelSleepRef.current?.();
    stop();
    setIsRepeating(false);
  }, [stop]);

  async function toggleRepeat(word: string) {
    if (isRepeating) {
      stopRepeat();
      return;
    }

    cancelledRef.current = false;
    setIsRepeating(true);
    const rate = isSlow ? SLOW_RATE : 1;

    for (let i = 0; i < repeatCount; i++) {
      if (cancelledRef.current) break;
      await speak(word, { rate });
      if (cancelledRef.current) break;

      if (i < repeatCount - 1) {
        const { promise, cancel } = cancellableSleep(pauseSeconds * 1000);
        cancelSleepRef.current = cancel;
        await promise;
        cancelSleepRef.current = null;
        if (cancelledRef.current) break;
      }
    }

    if (!cancelledRef.current) setIsRepeating(false);
  }

  // deckNotFound is a final, render-only state (folded into "all-caught-up"
  // for display below) rather than something the effect sets via
  // setViewState — that would be a synchronous setState-in-effect call.
  const effectiveStatus = deckNotFound ? "all-caught-up" : viewState.status;

  // Read inside the deck-loading effect without making it reactive to
  // every card-state change — rating a card writes to the SRS store, which
  // would otherwise re-trigger this effect and re-fetch/reshuffle mid
  // session. Only the source word list (saved words changing, or the deck
  // resolving) should do that; getCard/hasCard are read fresh at
  // rating/selection-time directly from srsCards, not through these refs.
  // Updated in their own effect (not directly in the render body) since
  // refs aren't meant to be written during render.
  const getCardRef = useRef(srsCards.getCard);
  const hasCardRef = useRef(srsCards.hasCard);
  useEffect(() => {
    getCardRef.current = srsCards.getCard;
    hasCardRef.current = srsCards.hasCard;
  }, [srsCards.getCard, srsCards.hasCard]);

  // Pre-fetch definitions for whatever's actually worth fetching, then (for
  // saved words) narrow to what's due today. The setState below happens
  // after the await, inside the resolved-promise callback — not
  // synchronously in the effect body — so this is the sanctioned
  // data-fetching pattern, not the setState-in-effect anti-pattern.
  useEffect(() => {
    if (isEmpty || deckNotFound) return; // nothing to fetch; these render directly, no effect needed
    // deckId is null only while the persisted last-studied-deck preference
    // is still loading (no explicit ?deck= in the URL) — see its
    // resolution above. Wait for it rather than assuming "saved" first.
    if (deckId === null) return;
    // Wait for real data before computing anything — srsCards.isLoading
    // isn't in this effect's deps to react to every rating (that's what
    // the refs above are for), but it does need to react to this one
    // loading -> loaded transition, so the queue gets computed against
    // real schedules rather than every word looking freshly due/new.
    if (sourceLoading || srsCards.isLoading) return;
    // Same double-fetch guard as components/word-detail.tsx: this fetches
    // a whole queue of words at once, so re-fetching once the real
    // preference arrives (after briefly assuming "en") would be even more
    // wasteful here than for a single word.
    if (languageLoading) return;

    // A real AbortController (not just a boolean flag) so React Strict
    // Mode's dev-only double-invoke of effects genuinely cancels the first
    // invocation's in-flight requests instead of just ignoring their
    // result — see the identical fix/comment in components/word-detail.tsx.
    const controller = new AbortController();

    async function loadDeck() {
      // Saved words: fetch every saved word, then filter to due below —
      // exactly today's existing, unchanged behavior. A real deck: only
      // ever fetch what selectWordsToStudy actually selected (due + a
      // capped number of never-studied words) — fetching an entire multi-
      // thousand-word deck on every visit isn't viable.
      const wordsToFetch = isSavedDeck
        ? sourceWords
        : selectWordsToStudy(sourceWords, {
            hasCard: hasCardRef.current,
            getCard: getCardRef.current,
          });

      const results = await Promise.all(
        wordsToFetch.map(async (word) => {
          try {
            const body = await fetchCachedDefinition(word, targetLanguage, {
              signal: controller.signal,
            });
            return body.status === "ok" ? body.data : null;
          } catch {
            return null;
          }
        }),
      );

      if (controller.signal.aborted) return;

      // Defensive: a word's cache doc should always be found:true (a
      // saved word only exists from a successful lookup; a deck word was
      // vetted at upload time), but don't let an unexpected miss break the
      // whole session.
      const valid = results.filter(
        (result): result is DefinitionResult => result?.found === true,
      );
      const now = new Date();
      // A real deck's wordsToFetch is already exactly the due/new
      // selection — no further filtering needed. Saved words still
      // narrows by due here, unchanged from before.
      const due = isSavedDeck
        ? valid.filter((entry) => getCardRef.current(entry.word).due <= now)
        : valid;

      setFlipped(false);
      setViewState(
        due.length > 0
          ? { status: "reviewing", queue: shuffle(due), index: 0 }
          : { status: "all-caught-up" },
      );
    }

    loadDeck();

    return () => {
      controller.abort();
    };
  }, [
    sourceWords,
    isEmpty,
    deckNotFound,
    sourceLoading,
    srsCards.isLoading,
    deckId,
    isSavedDeck,
    targetLanguage,
    languageLoading,
  ]);

  function rate(word: string, rating: Grade) {
    srsCards.rate(word, rating);

    setViewState((current) => {
      if (current.status !== "reviewing") return current;
      const nextIndex = current.index + 1;
      return nextIndex >= current.queue.length
        ? { status: "all-caught-up" }
        : { ...current, index: nextIndex };
    });
    setFlipped(false);
  }

  const card =
    viewState.status === "reviewing" ? viewState.queue[viewState.index] : null;

  // Stop any in-flight repeat cycle whenever the displayed word changes
  // (next card) or the component unmounts — covers loadDeck()'s success
  // path and rate()'s advance-to-next-card without needing to touch either
  // directly.
  useEffect(() => {
    return () => {
      stopRepeat();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.word]);

  const intervals = card ? srsCards.previewIntervals(card.word) : null;
  const nextDue =
    effectiveStatus === "all-caught-up" && !deckNotFound
      ? earliestDue(sourceWords, srsCards.getCard)
      : null;
  // "Saved words" is always a known label; a real deck's name isn't known
  // until useDecks() resolves, so this stays null (hiding the subtitle)
  // until then rather than flashing "Studying" with nothing after it.
  const deckLabel = isSavedDeck ? "Saved words" : (deck?.name ?? null);

  const cardState = card ? srsCards.getCard(card.word).state : null;
  const deckStats = getDeckStudyStats(sourceWords, srsCards);
  const statsReady =
    deckLabel !== null && !isEmpty && !sourceLoading && !srsCards.isLoading;
  const visibleRatingButtons =
    ratingButtonCount === 2
      ? RATING_BUTTONS.filter(
          (b) => b.rating === Rating.Again || b.rating === Rating.Good,
        )
      : RATING_BUTTONS;

  // Progress through *this session's* fixed queue (not the deck's overall
  // New/Learn/Due composition above, which doesn't change as you study).
  // sessionIndex reflects cards already rated — the currently-shown card
  // doesn't count as done yet — matching how rate() advances viewState.index.
  const sessionTotal =
    viewState.status === "reviewing" ? viewState.queue.length : 0;
  const sessionIndex = viewState.status === "reviewing" ? viewState.index : 0;

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-[34px] leading-[41px] font-bold tracking-[-0.4px]">
          Study
        </h1>
        {deckLabel && (
          <p className="text-sm text-muted-foreground">Studying {deckLabel}</p>
        )}
        {statsReady && (
          <p className="text-xs text-muted-foreground">
            {formatDeckStats(deckStats)}
          </p>
        )}
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
            <EmptyTitle>No saved words yet</EmptyTitle>
            <EmptyDescription>
              Save a word from a lookup to start building your flashcard deck.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link href="/" />} nativeButton={false}>
              Go look something up
            </Button>
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
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">
              Card {sessionIndex + 1} of {sessionTotal}
            </span>
            <Progress value={(sessionIndex / sessionTotal) * 100} />
          </div>

          <Card>
            <CardContent className="flex min-h-[300px] flex-col gap-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  {card.entries[0].partOfSpeech}
                </span>
                <div className="flex items-center gap-2">
                  {cardState !== null && (
                    <Badge variant="outline">{CARD_STATE_LABEL[cardState]}</Badge>
                  )}
                  {card.cefrLevel && (
                    <Badge variant="secondary">{card.cefrLevel}</Badge>
                  )}
                </div>
              </div>

              {flipped ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-serif text-[34px] leading-tight font-bold">
                        {capitalizeFirstLetter(card.word)}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          type="button"
                          variant={isRepeating ? "default" : "glass"}
                          size="icon"
                          className="size-11"
                          onClick={() => toggleRepeat(card.word)}
                          aria-label={
                            isRepeating
                              ? `Stop repeating pronunciation of ${card.word}`
                              : `Repeat pronunciation of ${card.word}`
                          }
                          aria-pressed={isRepeating}
                        >
                          {isSpeaking ? <Spinner /> : <Volume2Icon />}
                        </Button>
                        <Button
                          type="button"
                          variant={isSlow ? "default" : "glass"}
                          size="icon"
                          className="size-11"
                          onClick={() => setIsSlow((prev) => !prev)}
                          aria-label={
                            isSlow
                              ? "Switch to normal speed"
                              : "Switch to slow speed"
                          }
                          aria-pressed={isSlow}
                        >
                          <TurtleIcon />
                        </Button>
                      </div>
                    </div>
                    {(card.ipa || card.syllables) && (
                      <div className="flex flex-col gap-0.5">
                        {card.ipa && (
                          <span className="font-mono text-base text-muted-foreground">
                            {card.ipa}
                          </span>
                        )}
                        {card.syllables && (
                          <span className="text-base text-muted-foreground">
                            {card.syllables}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-4 border-t border-[rgba(60,60,67,0.16)] pt-4">
                    <p className="text-base">{card.entries[0].definition}</p>

                    {card.entries[0].translations
                      .filter(
                        (translation) => translation.lang === targetLanguage,
                      )
                      .map((translation) => (
                        <div
                          key={translation.lang}
                          className="flex flex-col gap-1 rounded-[18px] bg-[rgba(118,118,128,0.1)] p-4"
                        >
                          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                            {languageDisplayNames.of(translation.lang) ??
                              translation.lang}
                          </span>
                          <p className="font-noto text-base">
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
                      <p className="text-base italic">
                        &ldquo;{card.entries[0].example}&rdquo;
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6 text-center">
                  <span className="font-serif text-[44px] leading-tight font-bold">
                    {capitalizeFirstLetter(card.word)}
                  </span>
                  {card.ipa && (
                    <span className="font-mono text-muted-foreground text-2xl">
                      {card.ipa}
                    </span>
                  )}
                  {card.syllables && (
                    <span className="text-muted-foreground text-2xl">
                      {card.syllables}
                    </span>
                  )}
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant={isRepeating ? "default" : "glass"}
                      size="icon"
                      className="size-15"
                      onClick={() => toggleRepeat(card.word)}
                      aria-label={
                        isRepeating
                          ? `Stop repeating pronunciation of ${card.word}`
                          : `Repeat pronunciation of ${card.word}`
                      }
                      aria-pressed={isRepeating}
                    >
                      {isSpeaking ? (
                        <Spinner className="size-8" />
                      ) : (
                        <Volume2Icon className="size-8" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant={isSlow ? "default" : "glass"}
                      size="icon"
                      className="size-15"
                      onClick={() => setIsSlow((prev) => !prev)}
                      aria-label={
                        isSlow
                          ? "Switch to normal speed"
                          : "Switch to slow speed"
                      }
                      aria-pressed={isSlow}
                    >
                      <TurtleIcon className="size-8" />
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="glass"
                    className="mt-10 w-full rounded-full text-foreground"
                    onClick={() => setFlipped(true)}
                  >
                    Tap to reveal
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {flipped && (
            <div
              className={
                ratingButtonCount === 2
                  ? "grid grid-cols-2 gap-2"
                  : "grid grid-cols-4 gap-2"
              }
            >
              {visibleRatingButtons.map(({ rating, label }) => (
                <Button
                  key={rating}
                  type="button"
                  variant={rating === Rating.Again ? "destructive" : "glass"}
                  className={
                    rating === Rating.Again
                      ? "h-14 flex-col gap-0.5 rounded-2xl"
                      : "h-14 flex-col gap-0.5 rounded-2xl text-foreground"
                  }
                  onClick={() => rate(card.word, rating)}
                >
                  <span className="text-sm font-semibold">{label}</span>
                  <span className="text-xs opacity-70">
                    {formatShortInterval(new Date(), intervals[rating])}
                  </span>
                </Button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
