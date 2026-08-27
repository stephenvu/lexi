import { State } from "ts-fsrs"

import type { SrsCards } from "@/lib/use-srs-cards"
import { shuffle } from "@/lib/utils"

// Anki's own default "new cards per day" — applied per visit here rather
// than a true daily count (simpler; the trade-off is a user could reload
// to see more new words sooner than a strict daily limit would allow, an
// edge case not worth the added complexity of tracking "how many new
// words already introduced today").
export const NEW_WORDS_PER_SESSION = 20

/**
 * From a candidate word list (e.g. a whole pre-loaded deck), returns what
 * to actually study right now: everything genuinely due for review, plus
 * up to NEW_WORDS_PER_SESSION never-before-seen words. Without this cap, a
 * large deck with nothing studied yet would try to introduce (and fetch
 * definitions for) its entire word list in one sitting — a word's memory
 * strength doesn't depend on which deck it came from, so "never studied"
 * is exactly as true for a 3,000-word deck as it is for a single newly
 * saved word. Used both to build the actual study queue (Study) and to
 * compute the "N to study" count shown before tapping in (Library), so
 * the two always agree. Not used for the saved-words "deck" itself, which
 * fetches every saved word and filters to due client-side (see
 * components/study-flashcards.tsx's isSavedDeck branch) — deliberately
 * uncapped, unlike this function's new-word cap.
 *
 * Which never-studied words get selected, when there are more than fit, is
 * randomized each call (shuffle before slicing) — not doc/upload order, so
 * a large deck doesn't always introduce the same first N words session
 * after session.
 */
export function selectWordsToStudy(
  words: string[],
  srsCards: Pick<SrsCards, "hasCard" | "getCard">
): string[] {
  const now = new Date()
  const due: string[] = []
  const fresh: string[] = []

  for (const word of words) {
    if (srsCards.hasCard(word)) {
      if (srsCards.getCard(word).due <= now) {
        due.push(word)
      }
    } else {
      fresh.push(word)
    }
  }

  return [...due, ...shuffle(fresh).slice(0, NEW_WORDS_PER_SESSION)]
}

export type DeckStudyStats = {
  newCount: number
  learnCount: number
  dueCount: number
}

/**
 * Deck-level New/Learn/Due counts for display (Study header, Library
 * rows). Unlike selectWordsToStudy, newCount is never capped to
 * NEW_WORDS_PER_SESSION — that cap is only about what gets fetched/studied
 * in one session, not how many new words genuinely exist in the deck.
 * Identical computation for the saved-words pseudo-deck and real decks —
 * no special-casing needed (unlike selectWordsToStudy, which the saved-
 * words deck bypasses entirely for its new-word cap; that cap simply
 * doesn't apply here).
 *
 * A word with no persisted card (!hasCard) is New. A persisted card is
 * only ever created via SrsCards.rate(), and FSRS always transitions a
 * card's state away from State.New on its first rating — so a persisted
 * card is never observed in State.New here; Learn/Due only consider
 * Learning/Relearning/Review states that are also currently due.
 */
export function getDeckStudyStats(
  words: string[],
  srsCards: Pick<SrsCards, "hasCard" | "getCard">
): DeckStudyStats {
  const now = new Date()
  let newCount = 0
  let learnCount = 0
  let dueCount = 0

  for (const word of words) {
    if (!srsCards.hasCard(word)) {
      newCount++
      continue
    }
    const card = srsCards.getCard(word)
    if (card.due > now) continue
    if (card.state === State.Learning || card.state === State.Relearning) {
      learnCount++
    } else if (card.state === State.Review) {
      dueCount++
    }
  }

  return { newCount, learnCount, dueCount }
}

/** Shared text formatting so Study and Library render the identical
 * phrasing without duplicating the template in both files. */
export function formatDeckStats(stats: DeckStudyStats): string {
  const { newCount, learnCount, dueCount } = stats
  if (newCount === 0 && learnCount === 0 && dueCount === 0) return "All caught up"
  return `${newCount} new · ${learnCount} learning · ${dueCount} due`
}
