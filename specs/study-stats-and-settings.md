# Spec: Study stats & rating-button settings

Status: Implemented.

## Overview

Four related additions to Study/Library, layered on top of the existing FSRS-based spaced-repetition system (`lib/use-srs-cards.ts`, `lib/deck-study.ts`):

1. Per-user setting: 2 vs. 4 rating buttons when grading a flashcard (default 2: Again/Good).
2. Deck-level New/Learn/Due stats, shown on both `/study`'s header and `/library`'s deck rows.
3. A per-card FSRS state badge ("New"/"Learning"/"Review"/"Relearn") on the flashcard itself.
4. Randomized (not deck/upload order) selection of which never-studied words enter a session, when a deck has more fresh words than fit.

## Data model

- New `UserDoc` field (`lib/use-user-doc.ts`): `ratingButtonCount?: number` (2 or 4; missing/anything else falls back to 2). Read/written via `lib/use-rating-button-count.ts`, same shared-per-uid-Firestore-doc pattern as every other per-user setting (`lib/use-tts-settings.ts`, `lib/use-target-language.ts`).
- No new fields for stats or card state — both are computed client-side from data that already exists (`SrsCards.hasCard`/`getCard`, `Card.state`/`due` from `ts-fsrs`), the same way the pre-existing "N to study" count was.

## Shared logic (`lib/deck-study.ts`)

- `getDeckStudyStats(words, srsCards) -> { newCount, learnCount, dueCount }`: New = no persisted card; Learn = has a card, due now, state Learning/Relearning; Due = has a card, due now, state Review. Never capped by `NEW_WORDS_PER_SESSION` (that cap is about what one session fetches, not the deck's real composition). Identical for the saved-words pseudo-deck and real pre-loaded decks.
- `formatDeckStats(stats) -> string`: `"{new} new · {learn} learning · {due} due"`, or `"All caught up"` when all three are zero. Shared by Study's header and Library's deck rows so the two never drift.
- `selectWordsToStudy` (pre-existing): its never-studied-word slice is now taken from a shuffled copy of the candidate list (`lib/utils.ts`'s `shuffle`) before applying the `NEW_WORDS_PER_SESSION` cap, rather than the first N in stored order. The due-word portion is unaffected — it was already uncapped and unordered-by-this-function (queue display order is shuffled separately downstream in `components/study-flashcards.tsx`).

## UI plan

- **Settings** (`app/settings/page.tsx`): new "Rating buttons" row, 2-item `Select` ("2 (Again / Good)" / "4 (Again / Hard / Good / Easy)"), same card style as every other setting on the page.
- **Study header** (`components/study-flashcards.tsx`): a `text-xs text-muted-foreground` stats line under "Studying {deck}", shown once the deck/word source and SRS data have both resolved (no flash of zeroed counts while loading).
- **Flashcard**: a `Badge variant="outline"` with the card's current FSRS state, next to the existing CEFR-level badge in the part-of-speech row — that row is shared by both card faces (front/back), so the state badge is visible either way.
- **Rating row**: `grid-cols-2` (Again/Good only) or `grid-cols-4` (all four), driven by the setting; interval previews (`previewIntervals`) are computed for all four grades regardless — only which buttons render changes.
- **Library** (`app/library/page.tsx`): each deck row's second line (including the synthetic "Saved words" deck) now reads `"{N} cards · {stats}"` using the same `formatDeckStats` output as Study, replacing the old single "N to study"/"All caught up" text. The old `countDueForStudy` local helper was removed in favor of `getDeckStudyStats`.

## Edge cases

- Loading (`srsCards.isLoading` / `decksLoading` / `saved.isLoading`): Study's stats line stays hidden until ready; Library's whole deck list block was already gated behind these flags.
- Saved-words pseudo-deck: no special-casing in `getDeckStudyStats` — a saved word with no rating yet is New, same as any deck word.
- A word can never be observed in FSRS `State.New` once it has a persisted card — `rate()` always transitions off `New` on first rating — so `getDeckStudyStats`'s New bucket is exactly "no card yet," matching `hasCard`.
- A deck/word-list with zero words reports `{0,0,0}` → "All caught up", same fallback text as a fully-caught-up deck.

## Explicitly deferred

- True daily new-word limits (still per-visit via `NEW_WORDS_PER_SESSION`, unchanged).
- Per-deck override of the rating-button-count setting (it's a single global per-user preference).
- Historical/graph stats, streaks, or review-history views.
- Undo-last-rating.
