import { FieldValue } from "firebase-admin/firestore"

import { db } from "@/lib/firebase-admin"
import {
  GEMINI_MODEL,
  generateDefinition,
  normalizeWord,
  type DefinitionResult,
} from "@/lib/gemini"
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
// only, no Gemini), but the same concurrent-duplicate risk applies.
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
 * Attaches Google-Translate-sourced translations to every entry. A total
 * failure here (a per-language failure is already handled inside
 * translateEntries) still returns `result` unchanged — translations are an
 * enhancement on top of the core lookup, never a reason to fail it.
 */
async function attachTranslations(result: DefinitionResult): Promise<DefinitionResult> {
  try {
    const translationsPerEntry = await translateEntries(result.word, result.entries)
    return {
      ...result,
      entries: result.entries.map((entry, index) => ({
        ...entry,
        translations: translationsPerEntry[index],
      })),
    }
  } catch (error) {
    console.error(`Failed to translate definition for "${result.word}":`, error)
    return result
  }
}

/**
 * Backfills translations for a cached result that predates them — every
 * word from the bulk-seeded Oxford-3000 dataset, plus anything looked up
 * before the Translate integration existed or before
 * GOOGLE_TRANSLATE_API_KEY was configured. A no-op (returns `cached`
 * unchanged) once every entry already has at least one translation, so
 * this only ever does real work once per word. Not gated by the per-IP
 * rate limit — that exists for Gemini's cost, not Translate's, and this
 * only ever runs against already-cached data.
 */
function backfillTranslations(key: string, cached: DefinitionResult): Promise<DefinitionResult> {
  const needsBackfill = cached.entries.some((entry) => entry.translations.length === 0)
  if (!needsBackfill) {
    return Promise.resolve(cached)
  }

  return coalesce(inFlightBackfills, key, async () => {
    const withTranslations = await attachTranslations(cached)

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
 * `ip` gates only the cache-miss path below (a rate limit on new Gemini
 * calls, the actual cost driver) — cache hits are free and stay unlimited.
 *
 * Concurrent requests for the *same* word are coalesced on both the
 * cache-miss (generation) and cache-hit (translation backfill, see
 * `backfillTranslations`) paths — only the first caller actually does the
 * work; any others arriving before it finishes just await that same
 * result.
 */
export async function getDefinition(rawWord: string, ip: string): Promise<DefinitionResult> {
  const key = normalizeWord(rawWord).toLowerCase()

  const cached = await readCache(key)
  if (cached) {
    return backfillTranslations(key, cached)
  }

  return coalesce(inFlightGenerations, key, async () => {
    await checkRateLimit(ip)

    const generated = await generateDefinition(rawWord)
    const withTranslations = await attachTranslations(generated)

    writeCache(key, withTranslations).catch((error) => {
      console.error(`Failed to cache definition for "${key}":`, error)
    })

    return withTranslations
  })
}
