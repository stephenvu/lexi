import type { SrsCards } from "@/lib/use-srs-cards"

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
 * the two always agree. Not used for the saved-words "deck" itself — see
 * countDueForStudy in app/library/page.tsx, which is deliberately uncapped.
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

  return [...due, ...fresh.slice(0, NEW_WORDS_PER_SESSION)]
}
