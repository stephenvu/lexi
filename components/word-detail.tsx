"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  SearchIcon,
  StarIcon,
  Volume2Icon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { DefinitionResult } from "@/lib/gemini";
import { usePersistedList } from "@/lib/use-persisted-list";
import { useSrsCards } from "@/lib/use-srs-cards";
import { useSpeech } from "@/lib/use-speech";
import { useTargetLanguage } from "@/lib/use-target-language";
import { capitalizeFirstLetter, cn } from "@/lib/utils";

const HISTORY_CAP = 20;

// Renders a translation's ISO 639-1 "lang" code (e.g. "vi") as a display
// name (e.g. "Vietnamese") — no hardcoded name-lookup table needed.
const languageDisplayNames = new Intl.DisplayNames(["en"], {
  type: "language",
});

type State =
  | { status: "loading" }
  | { status: "success"; data: DefinitionResult }
  | { status: "not-found"; message: string | null; suggestion: string | null }
  | { status: "error"; message: string };

// The full lookup for a single word — pushed from Home's search, a recent
// lookup, a Library Saved row, or a synonym/antonym chip tapped on this
// same page. Rendered from app/word/[word]/page.tsx, which passes `key`
// so navigating between words remounts fresh rather than needing an effect
// to reset state.
export function WordDetail({ word }: { word: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([0]));

  const { isSpeaking, speak } = useSpeech();
  const { add: addToHistory } = usePersistedList("history", {
    cap: HISTORY_CAP,
  });
  const saved = usePersistedList("favorites");
  const srsCards = useSrsCards();
  const { targetLanguage, isLoading: languageLoading } = useTargetLanguage();

  // usePersistedList's `add` is now Firestore-backed and depends on the
  // signed-in uid (unavailable for a brief moment while useAuth() resolves
  // client-side), so its identity changes once auth settles. Reading it
  // through a ref — rather than putting addToHistory directly in the
  // effect's deps — keeps the word-lookup effect below from re-firing (and
  // re-fetching the same word a second time) purely because auth resolved
  // partway through.
  const addToHistoryRef = useRef(addToHistory);
  useEffect(() => {
    addToHistoryRef.current = addToHistory;
  }, [addToHistory]);

  useEffect(() => {
    // Wait for the user's target-language preference to load before firing
    // the lookup at all — otherwise this would fetch once with the
    // pre-load default ("en"), then again the moment the real preference
    // (e.g. "vi") arrives from Firestore, doubling the Gemini/Translate
    // cost on every uncached word. The main lookup itself doesn't need to
    // wait on auth for anything else (the session cookie authorizing the
    // request is already attached), just this one preference.
    if (languageLoading) return;

    // A boolean "cancelled" flag only gates the setState calls below — it
    // never aborts the underlying fetch. Under React Strict Mode's dev-only
    // double-invoke of effects, that let two real requests (and two real
    // Gemini/Translate calls on an uncached word) fire nearly
    // simultaneously. A real AbortController fixes that: the first
    // invocation's request is genuinely cancelled before it reaches the
    // server, not just ignored after the fact.
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(
          `/api/define?word=${encodeURIComponent(word)}&lang=${encodeURIComponent(targetLanguage)}`,
          {
            signal: controller.signal,
          },
        );
        const body = await response.json();

        if (body.status !== "ok") {
          setState({
            status: "error",
            message: body.message ?? "Something went wrong.",
          });
          return;
        }

        const data = body.data as DefinitionResult;
        if (!data.found) {
          setState({
            status: "not-found",
            message: data.message,
            suggestion: data.suggestion,
          });
          return;
        }

        addToHistoryRef.current(data.word);
        setState({ status: "success", data });
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setState({
          status: "error",
          message: "Something went wrong. Please try again.",
        });
      }
    }

    load();

    return () => {
      controller.abort();
    };
  }, [word, targetLanguage, languageLoading]);

  function goToWord(rawWord: string) {
    const trimmed = rawWord.trim();
    if (!trimmed) return;
    router.push(`/word/${encodeURIComponent(trimmed)}`);
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    goToWord(query);
  }

  function toggleSense(index: number) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  const isSaved =
    state.status === "success" && saved.has(state.data.word);

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex items-center gap-2.5">
        <Button
          type="button"
          variant="glass"
          size="icon"
          className="shrink-0 rounded-full"
          onClick={() => router.back()}
          aria-label="Back"
        >
          <ChevronLeftIcon />
        </Button>
        <form onSubmit={handleSearchSubmit} className="min-w-0 flex-1">
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Look up a word…"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </InputGroup>
        </form>
        {state.status === "success" && (
          <Button
            type="button"
            variant="glass"
            size="icon"
            className="shrink-0 rounded-full"
            disabled={saved.isLoading}
            onClick={() => {
              if (isSaved) {
                saved.remove(state.data.word);
                srsCards.remove(state.data.word);
              } else {
                saved.add(state.data.word);
              }
            }}
            aria-label={
              isSaved
                ? `Remove ${state.data.word} from Saved`
                : `Save ${state.data.word}`
            }
          >
            {saved.isLoading ? (
              <Spinner />
            ) : (
              <StarIcon fill={isSaved ? "currentColor" : "none"} />
            )}
          </Button>
        )}
      </div>

      {state.status === "loading" && (
        <div className="glass-surface flex flex-col gap-3.5 rounded-[26px] p-6">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-px w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-20 w-full rounded-[18px]" />
        </div>
      )}

      {state.status === "success" && (
        <div className="glass-surface flex flex-col gap-4 rounded-[26px] p-6">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5">
              <span className="font-serif text-[40px] leading-tight font-semibold tracking-tight">
                {capitalizeFirstLetter(state.data.word)}
              </span>
              {state.data.cefrLevel && (
                <Badge variant="secondary">{state.data.cefrLevel}</Badge>
              )}
            </div>
            {(state.data.ipa || state.data.syllables) && (
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  {state.data.ipa && (
                    <span className="font-mono text-muted-foreground">
                      {state.data.ipa}
                    </span>
                  )}
                  {state.data.syllables && (
                    <span className="text-muted-foreground">
                      {state.data.syllables}
                    </span>
                  )}
                </div>

                <Button
                  type="button"
                  variant="glass"
                  size="icon-lg"
                  onClick={() => speak(state.data.word)}
                  aria-label={`Play pronunciation of ${state.data.word}`}
                >
                  {isSpeaking ? <Spinner /> : <Volume2Icon />}
                </Button>
              </div>
            )}
          </div>

          <div className="h-px bg-[rgba(60,60,67,0.16)]" />

          <div className="flex flex-col">
            {state.data.entries.map((entry, index) => {
              const isExpanded = expanded.has(index);
              return (
                <div
                  key={index}
                  className={cn(
                    "flex flex-col gap-3",
                    index > 0 &&
                      "mt-3 border-t border-[rgba(60,60,67,0.16)] pt-3",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleSense(index)}
                    className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
                  >
                    <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                      {entry.partOfSpeech}
                    </span>
                    <ChevronDownIcon
                      className={cn(
                        "size-[18px] shrink-0 text-muted-foreground/60 transition-transform",
                        isExpanded && "rotate-180",
                      )}
                    />
                  </button>

                  {isExpanded ? (
                    <>
                      <p>{entry.definition}</p>
                      {entry.usageNote && (
                        <p className="text-sm text-muted-foreground">
                          {entry.usageNote}
                        </p>
                      )}
                      {entry.translations
                        .filter((translation) => translation.lang === targetLanguage)
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
                                {" - "}
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
                          &ldquo;{entry.example}&rdquo;
                        </p>
                      </div>
                      {entry.synonyms.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                            Synonyms
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {entry.synonyms.map((synonym) => (
                              <button
                                key={synonym}
                                type="button"
                                onClick={() => goToWord(synonym)}
                              >
                                <Badge variant="secondary">{synonym}</Badge>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {entry.antonyms.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                            Antonyms
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {entry.antonyms.map((antonym) => (
                              <button
                                key={antonym}
                                type="button"
                                onClick={() => goToWord(antonym)}
                              >
                                <Badge variant="secondary">{antonym}</Badge>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="truncate text-sm text-muted-foreground">
                      {entry.definition}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {state.status === "not-found" && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpenIcon />
            </EmptyMedia>
            <EmptyTitle>No definition found</EmptyTitle>
            <EmptyDescription>
              {state.message ?? "That doesn't look like a word we can define."}
            </EmptyDescription>
          </EmptyHeader>
          {state.suggestion && (
            <EmptyContent>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => goToWord(state.suggestion!)}
              >
                Did you mean &ldquo;{state.suggestion}&rdquo;?
              </Button>
            </EmptyContent>
          )}
        </Empty>
      )}

      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Lookup failed</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
