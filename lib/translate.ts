import { v2 } from "@google-cloud/translate"

import type { DefinitionEntry } from "@/lib/gemini"

const { Translate } = v2

// Comma-separated ISO 639-1 codes. Defaults to just Vietnamese, matching
// the app's previous single-language default — an array so adding more
// languages later (e.g. a future Settings page) is a config change, not a
// schema change.
const TARGET_LANGUAGES = (process.env.TRANSLATE_TARGET_LANGUAGES ?? "vi")
  .split(",")
  .map((code) => code.trim())
  .filter(Boolean)

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
 * Translates every entry (sense) of a word into each configured target
 * language, returning one translations array per entry (same order as
 * `entries`). Batches all entries into a single Translate API call per
 * language — a 3-sense word with 1 target language costs 1 request, not 3.
 *
 * Never throws: a missing API key or a failed language just means that
 * language contributes no translations — this is an enhancement on top of
 * the core lookup, not a requirement for it.
 */
export async function translateEntries(
  word: string,
  entries: DefinitionEntry[]
): Promise<Translation[][]> {
  if (entries.length === 0 || !process.env.GOOGLE_TRANSLATE_API_KEY) {
    return entries.map(() => [])
  }

  const inputs = entries.map((entry) => `${word} - ${entry.definition}`)

  const perLanguage = await Promise.allSettled(
    TARGET_LANGUAGES.map(async (lang) => {
      const [translated] = await getClient().translate(inputs, lang)
      const texts = Array.isArray(translated) ? translated : [translated]
      return texts.map((text) => ({ lang, ...splitWordAndMeaning(word, text) }))
    })
  )

  for (const result of perLanguage) {
    if (result.status === "rejected") {
      console.error(`Translation failed for "${word}":`, result.reason)
    }
  }

  const succeeded = perLanguage.filter(
    (result): result is PromiseFulfilledResult<Translation[]> => result.status === "fulfilled"
  )

  return entries.map((_, entryIndex) => succeeded.map((result) => result.value[entryIndex]))
}
