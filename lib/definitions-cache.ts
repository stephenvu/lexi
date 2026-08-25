import { FieldValue } from "firebase-admin/firestore"

import { db } from "@/lib/firebase-admin"
import {
  GEMINI_MODEL,
  generateDefinition,
  normalizeWord,
  type DefinitionResult,
} from "@/lib/gemini"
import { DEFAULT_TARGET_LANGUAGE, isSupportedLanguage } from "@/lib/languages"
import { checkRateLimit } from "@/lib/rate-limit"
import { translateEntries } from "@/lib/translate"

const COLLECTION = "definitions"

/**
 * Coalesces concurrent async work for the same key within this process —
 * e.g. React Strict Mode's dev-only double-invoke of effects, two real
 * users hitting the same word at nearly the same moment, or a double-click
 * before the UI disables itself. Without this, every concurrent caller
 * would independently pay for its own Gemini/Translate call. Self-cleaning:
 * an entry only exists for the duration of its in-flight request.
 */
function coalesce<T>(map: Map<string, Promise<T>>, key: string, run: () => Promise<T>): Promise<T> {
  const existing = map.get(key)
  if (existing) {
    return existing
  }

  const promise = run().finally(() => map.delete(key))
  map.set(key, promise)
  return promise
}

// Cache-miss lookups (new words) — each entry pays for its own Gemini call.
const inFlightGenerations = new Map<string, Promise<DefinitionResult>>()
// Cache-hit backfills (see backfillTranslations below) — cheaper (Translate
// only, no Gemini), but the same concurrent-duplicate risk applies. Keyed by
// `${word}:${lang}` so two users requesting different languages for the
// same word don't wait on each other.
const inFlightBackfills = new Map<string, Promise<DefinitionResult>>()

type CachedDefinition = DefinitionResult & {
  model: string
  createdAt: FirebaseFirestore.Timestamp
}

// Defensive against cache docs written before a schema field existed (e.g.
// the Richer Lookups fields) — always-possibly-absent, so default rather
// than let the UI see `undefined`.
async function readCache(key: string): Promise<DefinitionResult | null> {
  const snapshot = await db.collection(COLLECTION).doc(key).get()
  if (!snapshot.exists) {
    return null
  }
  const data = snapshot.data() as CachedDefinition
  return {
    word: data.word,
    found: data.found,
    message: data.message ?? null,
    ipa: data.ipa ?? null,
    syllables: data.syllables ?? null,
    cefrLevel: data.cefrLevel ?? null,
    suggestion: data.suggestion ?? null,
    entries: (data.entries ?? []).map((entry) => ({
      partOfSpeech: entry.partOfSpeech,
      definition: entry.definition,
      example: entry.example,
      synonyms: entry.synonyms ?? [],
      antonyms: entry.antonyms ?? [],
      usageNote: entry.usageNote ?? null,
      translations: entry.translations ?? [],
    })),
  }
}

/**
 * Fetches `targetLanguage` for every entry and merges it into each entry's
 * existing `translations` array (keyed by language — a word can accumulate
 * translations for several languages over time as different users request
 * different ones, so this adds rather than replaces). A total failure here
 * (a request failure is already handled inside translateEntries) still
 * returns `result` unchanged — translations are an enhancement on top of
 * the core lookup, never a reason to fail it.
 */
async function attachTranslations(
  result: DefinitionResult,
  targetLanguage: string
): Promise<DefinitionResult> {
  try {
    const translationsPerEntry = await translateEntries(result.word, result.entries, targetLanguage)
    return {
      ...result,
      entries: result.entries.map((entry, index) => ({
        ...entry,
        translations: [
          ...entry.translations.filter((t) => t.lang !== targetLanguage),
          ...translationsPerEntry[index],
        ],
      })),
    }
  } catch (error) {
    console.error(`Failed to translate definition for "${result.word}":`, error)
    return result
  }
}

/**
 * Backfills `targetLanguage` for a cached result that doesn't have it yet
 * on every entry — either because it predates the Translate integration
 * entirely (e.g. the bulk-seeded Oxford-3000 dataset), or because this is
 * simply the first time anyone has requested this particular language for
 * this word. A no-op (returns `cached` unchanged) once every entry already
 * has it, so this only ever does real work once per (word, language) pair.
 * Not gated by the per-uid rate limit — that exists for Gemini's cost, not
 * Translate's, and this only ever runs against already-cached data.
 */
function backfillTranslations(
  key: string,
  cached: DefinitionResult,
  targetLanguage: string
): Promise<DefinitionResult> {
  const needsBackfill =
    targetLanguage !== "en" &&
    cached.entries.some((entry) => !entry.translations.some((t) => t.lang === targetLanguage))
  if (!needsBackfill) {
    return Promise.resolve(cached)
  }

  return coalesce(inFlightBackfills, `${key}:${targetLanguage}`, async () => {
    const withTranslations = await attachTranslations(cached, targetLanguage)

    writeCache(key, withTranslations).catch((error) => {
      console.error(`Failed to persist backfilled translations for "${key}":`, error)
    })

    return withTranslations
  })
}

async function writeCache(key: string, result: DefinitionResult): Promise<void> {
  await db
    .collection(COLLECTION)
    .doc(key)
    .set({
      ...result,
      model: GEMINI_MODEL,
      createdAt: FieldValue.serverTimestamp(),
    })
}

/**
 * Read-through cache in front of Gemini: normalizes the word, returns a
 * cached definition if one exists, otherwise generates one via Gemini and
 * caches it (both "found" and "not found" results are cached, so repeated
 * gibberish lookups aren't re-billed either).
 *
 * A cache-write failure is logged but never surfaces to the caller — a
 * successful Gemini lookup should still be returned even if Firestore is
 * temporarily unavailable.
 *
 * `uid` (the signed-in user, from the caller's verified session cookie)
 * gates only the cache-miss path below (a rate limit on new Gemini calls,
 * the actual cost driver) — cache hits are free and stay unlimited.
 *
 * `targetLanguage` (the caller's Settings preference, "en" by default —
 * see lib/translate.ts's SUPPORTED_LANGUAGES) picks which language's
 * translation to ensure is present; an unrecognized value falls back to
 * "en" (no translation) rather than growing the shared cache with garbage.
 *
 * Concurrent requests for the *same* word are coalesced on both the
 * cache-miss (generation) and cache-hit (translation backfill, see
 * `backfillTranslations`) paths — only the first caller actually does the
 * work; any others arriving before it finishes just await that same
 * result.
 */
export async function getDefinition(
  rawWord: string,
  uid: string,
  targetLanguage: string = DEFAULT_TARGET_LANGUAGE
): Promise<DefinitionResult> {
  const key = normalizeWord(rawWord).toLowerCase()
  const language = isSupportedLanguage(targetLanguage) ? targetLanguage : DEFAULT_TARGET_LANGUAGE

  const cached = await readCache(key)
  if (cached) {
    return backfillTranslations(key, cached, language)
  }

  return coalesce(inFlightGenerations, key, async () => {
    await checkRateLimit(uid)

    const generated = await generateDefinition(rawWord)
    const withTranslations = await attachTranslations(generated, language)

    writeCache(key, withTranslations).catch((error) => {
      console.error(`Failed to cache definition for "${key}":`, error)
    })

    return withTranslations
  })
}
