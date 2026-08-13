# Spec: Study Features

Status: **Draft — not yet implemented.** This is the "Study features" item from `README.md`'s Features roadmap, unblocked now that [Saved Words & History](../README.md) exists — flashcards need a favorites list to draw from.

## Overview

This pass adds two small, favorites-powered study aids:

- **Word of the day** — a featured word on the homepage, drawn from the user's own favorites.
- **Flashcards** — a `/study` page that flips through favorited words for review.

**Explicitly out of scope for this pass** (deferred, not rejected):
- Quiz / multiple-choice mode (picking the correct definition among distractors)
- Self-assessment or scoring tracking ("got it" / "still learning")
- Spaced repetition or any scheduling logic
- Sourcing the word-of-the-day from a new Gemini prompt or a curated word list
- Any accounts/sync-dependent version of either feature

## Architecture: zero backend changes

Both features are pure client-side composition over what already exists — **no new API route, no new Gemini prompt, no new Firestore collection.**

- The favorites list is `usePersistedList("lexi.favorites")` (`lib/use-persisted-list.ts`), already built for Saved Words & History.
- Every word in that list was already looked up (that's how it became a favorite), so its definition is already cached in Firestore. Fetching it again via the existing `GET /api/define?word=` is always a cache hit — fast, and adds no Gemini cost.

A future implementer should not assume either feature needs a new server-side piece; it doesn't.

## Word of the day

**Pick algorithm:** deterministic rotation — `dayOfYear() % favorites.length` indexes into the favorites array. This cycles through every favorite exactly once before any repeat, entirely computed client-side from `usePersistedList`'s existing snapshot. No randomness, no server involvement, no new storage.

**Zero favorites:** show a call-to-action card — e.g. "Favorite a word to see it featured here" — rather than hiding the section. This nudges the exact behavior (favoriting) that makes the feature work.

**Interaction — click to view, not auto-load.** The card shows only the word (optionally its part of speech, if cheaply available). Clicking it runs the same lookup path as any other word in the app, revealing the full result card. This matches an existing app-wide principle: every lookup is an explicit, user-triggered action (search is submit-only, "did you mean" requires a click-through, never auto-redirects). Auto-loading the definition on page visit would be a one-off exception to that principle, so this pass doesn't do it — even though it would almost always be a harmless cache hit.

**Placement and wiring:** a new `components/word-of-the-day.tsx`, structured like `components/recent-lookups.tsx` — takes `favorites: string[]` and `onSelect: (word: string) => void` as props. Rendered from `components/dictionary-search.tsx`, **above the search form** (a featured teaser on landing), passing the existing `favorites.items` and `handleChipClick`/`runSearch` already in scope there. Because it reuses the same selection path as synonym chips and the "did you mean" suggestion, clicking it naturally logs to history too — this is not special-cased, it's the same behavior every other clickable word already has.

## Flashcards

**Route:** new `app/study/page.tsx` rendering a new client component, `components/study-flashcards.tsx`. Add a small "Study your favorites" link on the homepage (always visible, pointing to `/study`) plus a "← Back to search" link on the study page itself.

**Entry flow (on mount):**
1. Read the current favorites via `usePersistedList("lexi.favorites")`.
2. If empty, render an empty state (reuse the `Empty` component, consistent with the homepage's word-of-the-day CTA) inviting the user back to the search page to favorite something. Stop here.
3. Otherwise, pre-fetch all favorited words' definitions in parallel (`Promise.all` over `GET /api/define?word=` for each). This happens inside a `useEffect` with an async IIFE + a `cancelled` guard — the `setState` that stores the fetched deck happens after the `await`, inside the resolved-promise callback, **not** synchronously in the effect body. (This distinction matters: a synchronous `setState` directly in an effect body is what tripped the `react-hooks/set-state-in-effect` lint rule during Saved Words & History; an async data-fetch-then-setState is the standard, sanctioned pattern and doesn't trigger it.)
4. Filter the fetched results to only those with `found: true` — defensive; a favorited word's cache doc should always be `found: true` (it can only be favorited from a successful result), but don't let a corrupted/unexpected entry break the whole deck.
5. Shuffle the filtered deck (fresh shuffle every time `/study` is visited — not persisted, not seeded).

**Card content — simplified, primary-sense only:**
- Front: the word.
- Back (on flip): the first entry's part of speech, its definition, and its example sentence only. No synonyms/antonyms/usage note — deliberately not a repeat of the full search result card, kept clean for quick review.

**Navigation:** a Flip control to reveal the back, then Next/Previous to move through the shuffled deck.

**End of deck:** a completion screen — "You've reviewed all N words" — with a Restart button that reshuffles the same fetched deck and starts over from card 1. (No need to re-fetch; the pre-fetched definitions are still valid.)

## Edge cases

- **A favorited word's cache doc isn't `found: true`.** Shouldn't happen given how favoriting works, but the pre-fetch filters these out rather than crashing or rendering a broken card.
- **Favorites change while `/study` is open** (e.g. another tab unfavorites something). The effect depends on the favorites snapshot, so it re-runs and reshuffles with the updated list — an acceptable, unsurprising outcome, not a bug to special-case.
- **Word-of-the-day and flashcard-triggered lookups both log to history.** Both reuse the same lookup path already used by synonym/antonym/did-you-mean chips, so this falls out naturally rather than needing new logic.
- **Only one favorite exists.** Word-of-the-day rotation trivially always picks it. Flashcards work fine with a one-card deck (flip, then immediately hit the completion screen on "Next").

## Explicitly deferred

- Quiz / multiple-choice mode
- Self-assessment / scoring
- Spaced repetition or scheduling
- Gemini-generated or curated-list word-of-the-day
- Accounts/sync-dependent versions of either feature
