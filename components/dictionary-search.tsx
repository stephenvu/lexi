"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpenIcon, SearchIcon, StarIcon, Volume2Icon } from "lucide-react";

import { RecentLookups } from "@/components/recent-lookups";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { DefinitionResult } from "@/lib/gemini";
import { cn } from "@/lib/utils";
import { usePersistedList } from "@/lib/use-persisted-list";
import { useSpeech } from "@/lib/use-speech";
import { capitalizeFirstLetter } from "@/lib/utils";

const HISTORY_CAP = 20;

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: DefinitionResult }
  | { status: "not-found"; message: string | null; suggestion: string | null }
  | { status: "error"; message: string };

export function DictionarySearch() {
  const searchParams = useSearchParams();
  // Library's Saved rows link here as `/?word=<word>` to jump straight into
  // "the full lookup" — read once as the initial value rather than via an
  // effect, since this is genuinely part of the component's initial render
  // state, not an external system to synchronize with after the fact.
  const [word, setWord] = useState(() => searchParams.get("word") ?? "");
  const [state, setState] = useState<State>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const deepLinkRanRef = useRef(false);

  const { canSpeak, isSpeaking, speak } = useSpeech();

  const history = usePersistedList("lexi.history", { cap: HISTORY_CAP });
  const favorites = usePersistedList("lexi.favorites");

  const runSearch = useCallback(
    async (rawWord: string) => {
      const trimmed = rawWord.trim();
      if (!trimmed) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({ status: "loading" });

      try {
        const response = await fetch(
          `/api/define?word=${encodeURIComponent(trimmed)}`,
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

        history.add(data.word);
        setState({ status: "success", data });
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setState({
          status: "error",
          message: "Something went wrong. Please try again.",
        });
      }
    },
    [history],
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runSearch(word);
  }

  // Run the deep-linked search once on mount. The ref guard (not an empty
  // dep array) is what keeps this to exactly one run even though
  // `runSearch` is a fresh reference whenever `history` changes.
  useEffect(() => {
    if (deepLinkRanRef.current) return;
    const deepLinkedWord = searchParams.get("word");
    if (!deepLinkedWord) return;
    deepLinkRanRef.current = true;
    // Deferred a tick: runSearch's first action is a synchronous setState
    // (the "loading" transition, wanted immediately for a user-submitted
    // search), which the set-state-in-effect rule won't allow called
    // directly from an effect body — queueMicrotask moves the call outside
    // the effect's own synchronous execution.
    queueMicrotask(() => runSearch(deepLinkedWord));
  }, [searchParams, runSearch]);

  // Shared by synonym/antonym chips and the "did you mean" suggestion —
  // updates the search box to match, then re-runs the same lookup path.
  function handleChipClick(chipWord: string) {
    setWord(chipWord);
    runSearch(chipWord);
  }

  const isLoading = state.status === "loading";

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Word of the day hidden for now — component/file untouched, just not rendered. */}

      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <InputGroup>
              <InputGroupInput
                name="word"
                placeholder="Look up a word…"
                autoComplete="off"
                disabled={isLoading}
                value={word}
                onChange={(event) => setWord(event.target.value)}
              />
              <InputGroupAddon align="inline-end">
                <Button type="submit" size="sm" disabled={isLoading}>
                  {isLoading ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <SearchIcon data-icon="inline-start" />
                  )}
                  Search
                </Button>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </FieldGroup>
      </form>

      <RecentLookups
        history={history.items}
        onSelect={handleChipClick}
        onRemove={history.remove}
      />

      {state.status === "loading" && (
        <Card>
          <CardContent className="flex flex-col gap-3.5">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </CardContent>
        </Card>
      )}

      {state.status === "success" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              {capitalizeFirstLetter(state.data.word)}
              {state.data.cefrLevel && (
                <Badge variant="secondary">{state.data.cefrLevel}</Badge>
              )}
            </CardTitle>
            <CardAction>
              <Button
                type="button"
                variant="glass"
                size="icon"
                onClick={() =>
                  favorites.has(state.data.word)
                    ? favorites.remove(state.data.word)
                    : favorites.add(state.data.word)
                }
                aria-label={
                  favorites.has(state.data.word)
                    ? `Remove ${state.data.word} from favorites`
                    : `Save ${state.data.word} to favorites`
                }
              >
                <StarIcon
                  fill={
                    favorites.has(state.data.word) ? "currentColor" : "none"
                  }
                />
              </Button>
            </CardAction>
            {state.data.ipa && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span className="font-mono text-sm">{state.data.ipa}</span>
                {canSpeak && (
                  <Button
                    type="button"
                    variant="glass"
                    size="icon-sm"
                    onClick={() => speak(state.data.word)}
                    aria-label={`Play pronunciation of ${state.data.word}`}
                  >
                    {isSpeaking ? <Spinner /> : <Volume2Icon />}
                  </Button>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-[rgba(60,60,67,0.16)]">
            {state.data.entries.map((entry, index) => (
              <div
                key={index}
                className={cn(
                  "flex flex-col gap-2",
                  index > 0 && "pt-4",
                  index < state.data.entries.length - 1 && "pb-4",
                )}
              >
                <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  {entry.partOfSpeech}
                </span>
                <p>{entry.definition}</p>
                {entry.translatedDefinition && (
                  <p className="text-sm text-muted-foreground">
                    {entry.translatedWord
                      ? `${capitalizeFirstLetter(entry.translatedWord)} — ${entry.translatedDefinition}`
                      : entry.translatedDefinition}
                  </p>
                )}
                <p className="text-sm text-muted-foreground italic">
                  &ldquo;{entry.example}&rdquo;
                </p>
                {entry.usageNote && (
                  <p className="text-sm text-muted-foreground">
                    {entry.usageNote}
                  </p>
                )}
                {entry.synonyms.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">
                      Synonyms:
                    </span>
                    {entry.synonyms.map((synonym) => (
                      <button
                        key={synonym}
                        type="button"
                        onClick={() => handleChipClick(synonym)}
                      >
                        <Badge variant="secondary">{synonym}</Badge>
                      </button>
                    ))}
                  </div>
                )}
                {entry.antonyms.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">
                      Antonyms:
                    </span>
                    {entry.antonyms.map((antonym) => (
                      <button
                        key={antonym}
                        type="button"
                        onClick={() => handleChipClick(antonym)}
                      >
                        <Badge variant="secondary">{antonym}</Badge>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
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
                onClick={() => handleChipClick(state.suggestion!)}
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
