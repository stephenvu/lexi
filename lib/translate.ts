import { v2 } from "@google-cloud/translate"

import type { DefinitionEntry } from "@/lib/gemini"

const { Translate } = v2

// A plain hyphen, en dash, or em dash surrounded by whitespace — Google
// Translate can substitute a different dash glyph than the one sent.
const DASH_SEPARATOR = /\s[-–—]\s/

export type Translation = {
  lang: string
  word: string
  meaning: string
}

let client: InstanceType<typeof Translate> | null = null

function getClient() {
  if (!client) {
    const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY
    if (!apiKey) {
      throw new Error("GOOGLE_TRANSLATE_API_KEY is not set")
    }
    client = new Translate({ key: apiKey })
  }
  return client
}

/**
 * Splits a translated "word - meaning" string back into its two parts.
 * If the separator didn't survive translation, falls back to the original
 * (untranslated) word plus the whole translated string as the meaning,
 * rather than guessing where the split should be.
 */
function splitWordAndMeaning(
  originalWord: string,
  translatedText: string
): { word: string; meaning: string } {
  const match = translatedText.match(DASH_SEPARATOR)
  if (!match || match.index === undefined) {
    return { word: originalWord, meaning: translatedText.trim() }
  }

  return {
    word: translatedText.slice(0, match.index).trim(),
    meaning: translatedText.slice(match.index + match[0].length).trim(),
  }
}

/**
 * Translates every entry (sense) of a word into a single target language,
 * returning one single-element translations array per entry (same order as
 * `entries`) — empty if `targetLanguage` is "en" (the dictionary's own
 * source language, so there's nothing to translate) or on failure. Batches
 * all entries into one Translate API call — a 3-sense word costs 1 request,
 * not 3.
 *
 * Never throws: a missing API key or a failed request just means no
 * translation for this word right now — this is an enhancement on top of
 * the core lookup, not a requirement for it.
 */
export async function translateEntries(
  word: string,
  entries: DefinitionEntry[],
  targetLanguage: string
): Promise<Translation[][]> {
  if (
    entries.length === 0 ||
    targetLanguage === "en" ||
    !process.env.GOOGLE_TRANSLATE_API_KEY
  ) {
    return entries.map(() => [])
  }

  const inputs = entries.map((entry) => `${word} - ${entry.definition}`)

  try {
    const [translated] = await getClient().translate(inputs, targetLanguage)
    const texts = Array.isArray(translated) ? translated : [translated]
    return texts.map((text) => [{ lang: targetLanguage, ...splitWordAndMeaning(word, text) }])
  } catch (error) {
    console.error(`Translation to "${targetLanguage}" failed for "${word}":`, error)
    return entries.map(() => [])
  }
}
