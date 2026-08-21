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
 */
export async function getDefinition(rawWord: string, ip: string): Promise<DefinitionResult> {
  const key = normalizeWord(rawWord).toLowerCase()

  const cached = await readCache(key)
  if (cached) {
    return cached
  }

  await checkRateLimit(ip)

  const generated = await generateDefinition(rawWord)
  const withTranslations = await attachTranslations(generated)

  writeCache(key, withTranslations).catch((error) => {
    console.error(`Failed to cache definition for "${key}":`, error)
  })

  return withTranslations
}
