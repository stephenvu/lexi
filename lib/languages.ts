// Curated list of bilingual-translation target languages — shared between
// server code (lib/translate.ts, lib/definitions-cache.ts) and client code
// (lib/use-target-language.ts, app/settings/page.tsx). Deliberately
// dependency-free (no @google-cloud/translate import) so pulling this into
// a client bundle never drags in that package's Node-only transitive deps
// (grpc-js, etc.) — same rationale as lib/session-cookie.ts keeping
// firebase-admin out of proxy.ts's bundle.
//
// Not the full ~100+ languages Google Translate supports — this is both
// the Settings page's picker options and the set of values the server will
// actually act on (see isSupportedLanguage). "en" is first and is the
// default/"off" value: the dictionary's source language, so "translating"
// into it would be a no-op.
export const SUPPORTED_LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "vi", label: "Vietnamese" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "ru", label: "Russian" },
]

export const DEFAULT_TARGET_LANGUAGE = "en"

export function isSupportedLanguage(code: string): boolean {
  return SUPPORTED_LANGUAGES.some((language) => language.code === code)
}
