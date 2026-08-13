import { FieldValue } from "firebase-admin/firestore"

import { db } from "@/lib/firebase-admin"
import {
  GEMINI_MODEL,
  generateDefinition,
  normalizeWord,
  type DefinitionResult,
} from "@/lib/gemini"

const COLLECTION = "definitions"

type CachedDefinition = DefinitionResult & {
  model: string
  createdAt: FirebaseFirestore.Timestamp
}

async function readCache(key: string): Promise<DefinitionResult | null> {
  const snapshot = await db.collection(COLLECTION).doc(key).get()
  if (!snapshot.exists) {
    return null
  }
  const data = snapshot.data() as CachedDefinition
  return { word: data.word, found: data.found, message: data.message, entries: data.entries }
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
 */
export async function getDefinition(rawWord: string): Promise<DefinitionResult> {
  const key = normalizeWord(rawWord).toLowerCase()

  const cached = await readCache(key)
  if (cached) {
    return cached
  }

  const generated = await generateDefinition(rawWord)

  writeCache(key, generated).catch((error) => {
    console.error(`Failed to cache definition for "${key}":`, error)
  })

  return generated
}
