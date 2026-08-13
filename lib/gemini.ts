import { GoogleGenAI, Type } from "@google/genai"

// Flash-Lite model naming moves fast — override via GEMINI_MODEL if this
// default has been superseded. Check https://ai.google.dev/gemini-api/docs/models
// for the current recommended id.
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite"

const MAX_WORD_LENGTH = 100

let client: GoogleGenAI | null = null

function getClient() {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set")
    }
    client = new GoogleGenAI({ apiKey })
  }
  return client
}

export type DefinitionEntry = {
  partOfSpeech: string
  definition: string
  example: string
  synonyms: string[]
  antonyms: string[]
  usageNote: string | null
}

export type DefinitionResult = {
  word: string
  found: boolean
  message: string | null
  ipa: string | null
  suggestion: string | null
  entries: DefinitionEntry[]
}

const PARTS_OF_SPEECH = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "interjection",
  "determiner",
  "other",
] as const

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    found: { type: Type.BOOLEAN },
    word: { type: Type.STRING },
    message: { type: Type.STRING, nullable: true },
    ipa: { type: Type.STRING, nullable: true },
    suggestion: { type: Type.STRING, nullable: true },
    entries: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          partOfSpeech: { type: Type.STRING, enum: [...PARTS_OF_SPEECH] },
          definition: { type: Type.STRING },
          example: { type: Type.STRING },
          synonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
          antonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
          usageNote: { type: Type.STRING, nullable: true },
        },
        required: ["partOfSpeech", "definition", "example", "synonyms", "antonyms"],
      },
    },
  },
  required: ["found", "word", "entries"],
}

const SYSTEM_INSTRUCTION = `You are a concise, accurate dictionary. Given a single word or short phrase:
- If it is a recognizable English word or phrase, set found=true and return up to 5 entries, one per distinct sense, each with:
  - its part of speech, a one-sentence definition, and one natural example sentence using the word
  - up to 5 synonyms and up to 5 antonyms for that sense — return an empty array for either if none fit naturally; don't force weak matches
  - a short usageNote (e.g. "formal", "informal", "often used ironically") only when the word has a notable register, otherwise null
  Also set the word-level "ipa" to a standard IPA pronunciation transcription (e.g. "/ɪˈfɛmərəl/"), or null if genuinely unclear (e.g. unusual proper nouns).
- If it is not a recognizable English word (e.g. gibberish, a typo with no clear intended word, or empty), set found=false, return an empty entries array, and give a short one-sentence explanation in message. If — and only if — you are reasonably confident the input is a typo for a specific real word, set "suggestion" to that word's standard spelling; otherwise leave it null. Never guess at a suggestion you aren't confident in.
Always echo the headword back in "word" using its standard casing/spelling.`

export class InvalidWordError extends Error {}

/** Validates and normalizes raw user input before it's sent to Gemini. */
export function normalizeWord(rawWord: string): string {
  const trimmed = rawWord.trim().replace(/\s+/g, " ")
  if (!trimmed) {
    throw new InvalidWordError("Word must not be empty")
  }
  if (trimmed.length > MAX_WORD_LENGTH) {
    throw new InvalidWordError(`Word must be ${MAX_WORD_LENGTH} characters or fewer`)
  }
  return trimmed
}

/** Calls Gemini Flash Lite to generate a definition for the given word. Does not cache. */
export async function generateDefinition(word: string): Promise<DefinitionResult> {
  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: word,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema,
    },
  })

  const text = response.text
  if (!text) {
    throw new Error("Gemini returned an empty response")
  }

  const parsed = JSON.parse(text) as DefinitionResult
  if (typeof parsed.found !== "boolean" || !Array.isArray(parsed.entries)) {
    throw new Error("Gemini returned an unexpected response shape")
  }

  return {
    word: parsed.word || word,
    found: parsed.found,
    message: parsed.message ?? null,
    ipa: parsed.ipa ?? null,
    suggestion: parsed.suggestion ?? null,
    entries: parsed.entries.map((entry) => ({
      partOfSpeech: entry.partOfSpeech,
      definition: entry.definition,
      example: entry.example,
      synonyms: entry.synonyms ?? [],
      antonyms: entry.antonyms ?? [],
      usageNote: entry.usageNote ?? null,
    })),
  }
}

export const GEMINI_MODEL = MODEL
