"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRightIcon, LibraryIcon } from "lucide-react";

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
import { Skeleton } from "@/components/ui/skeleton";
import { formatDeckStats, getDeckStudyStats } from "@/lib/deck-study";
import { fetchCachedDefinition } from "@/lib/definitions-idb-cache";
import type { DefinitionResult } from "@/lib/gemini";
import { DEFAULT_TARGET_LANGUAGE } from "@/lib/languages";
import { SAVED_DECK_ID } from "@/lib/use-last-study-deck";
import { useDecks } from "@/lib/use-decks";
import { usePersistedList } from "@/lib/use-persisted-list";
import { useSrsCards } from "@/lib/use-srs-cards";
import { capitalizeFirstLetter, cn } from "@/lib/utils";

type Segment = "decks" | "saved";

type SavedState =
  | { status: "loading" }
  | { status: "ready"; words: DefinitionResult[] };

export default function LibraryPage() {
  const [segment, setSegment] = useState<Segment>("decks");
  const { decks, isLoading: decksLoading } = useDecks();
  const srsCards = useSrsCards();
  const saved = usePersistedList("favorites");
  // False while saved words are still loading, not just when the list is
  // genuinely empty — otherwise a user who does have saved words sees a
  // "No saved words yet" flash before their real data arrives from
  // Firestore.
  const isEmpty = !saved.isLoading && saved.items.length === 0;
  const [savedState, setSavedState] = useState<SavedState>({
    status: "loading",
  });

  // Same read-through pattern as the Study deck: saved words are always
  // cached already (saving only happens after a successful lookup), so
  // this is just re-fetching already-known data, not billing anything new.
  useEffect(() => {
    if (isEmpty || saved.isLoading) return;

    // A real AbortController (not just a boolean flag) so React Strict
    // Mode's dev-only double-invoke of effects genuinely cancels the first
    // invocation's in-flight requests instead of just ignoring their
    // result — see the identical fix/comment in components/word-detail.tsx.
    const controller = new AbortController();

    async function loadSaved() {
      const results = await Promise.all(
        saved.items.map(async (word) => {
          try {
            const body = await fetchCachedDefinition(
              word,
              DEFAULT_TARGET_LANGUAGE,
              { signal: controller.signal },
            );
            return body.status === "ok" ? body.data : null;
          } catch {
            return null;
          }
        }),
      );

      if (controller.signal.aborted) return;

      const valid = results.filter(
        (result): result is DefinitionResult => result?.found === true,
      );
      setSavedState({ status: "ready", words: valid });
    }

    loadSaved();

    return () => {
      controller.abort();
    };
  }, [saved.items, isEmpty, saved.isLoading]);

  return (
    <div className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:pb-24">
      <main className="flex w-full max-w-xl flex-col gap-6">
        <h1 className="text-[34px] leading-[41px] font-bold tracking-[-0.4px]">
          Library
        </h1>

        <div className="grid grid-cols-2 gap-1 rounded-[21px] border-[0.5px] border-white/70 dark:border-white/10 bg-[color-mix(in_oklch,white_44%,transparent)] dark:bg-[color-mix(in_oklch,var(--card)_55%,transparent)] p-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_6px_18px_rgba(12,32,24,0.06)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_6px_18px_rgba(0,0,0,0.35)] backdrop-blur-2xl backdrop-saturate-[1.8]">
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
                  ? "bg-[color-mix(in_oklch,white_92%,transparent)] dark:bg-[color-mix(in_oklch,var(--card)_92%,transparent)] font-semibold text-foreground shadow-[0_2px_6px_rgba(12,32,24,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_2px_6px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.08)]"
                  : "font-medium text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {segment === "decks" &&
          (decksLoading || srsCards.isLoading || saved.isLoading) && (
            <Card>
              <CardContent className="flex flex-col gap-3.5">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </CardContent>
            </Card>
          )}

        {segment === "decks" &&
          !decksLoading &&
          !srsCards.isLoading &&
          !saved.isLoading && (
            <div className="glass-surface flex flex-col overflow-hidden rounded-[26px]">
              {/* Saved words always leads the list — it's the user's own deck,
                not a pre-loaded one, so it's never subject to "no decks
                configured yet" the way the rest of this list theoretically
                could be. */}
              {[
                { id: SAVED_DECK_ID, name: "Saved words", words: saved.items },
                ...decks,
              ].map((deck, index, all) => {
                const stats = getDeckStudyStats(deck.words, srsCards);
                return (
                  <Link
                    key={deck.id}
                    href={`/study?deck=${encodeURIComponent(deck.id)}`}
                    className={cn(
                      "flex min-h-[64px] items-center gap-3 px-[18px] py-3.5",
                      index < all.length - 1 && "border-b hairline-border",
                    )}
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-heading text-lg font-semibold tracking-tight">
                        {deck.name}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {deck.words.length} cards · {formatDeckStats(stats)}
                      </span>
                    </div>
                    <ChevronRightIcon className="size-[18px] shrink-0 text-muted-foreground/50" />
                  </Link>
                );
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
                Save a word from a lookup and it will show up here.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button render={<Link href="/" />} nativeButton={false}>
                Go look something up
              </Button>
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
                  index < savedState.words.length - 1 &&
                    "border-b hairline-border",
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
                {entry.cefrLevel && (
                  <Badge variant="secondary">{entry.cefrLevel}</Badge>
                )}
                <ChevronRightIcon className="size-[18px] shrink-0 text-muted-foreground/50" />
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
