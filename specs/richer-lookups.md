# Spec: Richer Lookups

Status: **Draft — not yet implemented.** This is the "Richer Lookups" item from `README.md`'s Features roadmap, scoped down to a concrete, buildable pass.

## Overview

Today a lookup returns, per sense: part of speech, a one-sentence definition, and one example. This pass adds:

- Synonyms & antonyms per sense, clickable to look up
- IPA pronunciation text, plus a playable audio button
- A short usage note per sense (register/context, e.g. "formal", "often ironic")
- A "did you mean" suggestion when a lookup isn't a recognizable word

**Explicitly out of scope for this pass** (deferred, not rejected):
- Etymology
- Related/confusable words as a distinct feature — clickable synonyms/antonyms cover most of this value already
- Upgrading the Gemini model tier for accuracy
- Any cache schema-versioning/migration strategy
- Any cost/rate abuse guardrail (already a known gap from the original MVP; this pass increases the exposure slightly by making responses larger, but doesn't address it)

## Data model

Extend the types in `lib/gemini.ts`:

```ts
type DefinitionEntry = {
  partOfSpeech: string
  definition: string
  example: string
  synonyms: string[]      // new — up to 5, [] if none apply
  antonyms: string[]       // new — up to 5, [] if none apply
  usageNote: string | null // new — e.g. "formal", "informal", "often used ironically"
}

type DefinitionResult = {
  word: string
  found: boolean
  message: string | null
  ipa: string | null        // new — word-level, not per-sense
  suggestion: string | null // new — only present when found: false
  entries: DefinitionEntry[]
}
```

Design choices, and why:
- **Synonyms/antonyms/usage notes are per-sense, not per-word.** A word like "run" has different synonyms as a verb vs. a noun; attaching them to each entry is more accurate at the cost of a larger schema.
- **Pronunciation is per-word, not per-sense.** Heteronyms (e.g. "record" noun vs. verb, different stress) are a real but rare case; this pass shows one pronunciation for the whole word rather than adding IPA/audio to every entry. Revisit if this turns out to matter in practice.
- **Arrays are empty, not omitted, when nothing applies.** A word like "table" (as furniture) has no natural antonym — return `antonyms: []`, not a missing field. Same for `usageNote`/`ipa`/`suggestion`: `null`, not omitted, when not applicable.
- **`suggestion` is only ever populated on `found: false`.** It's Gemini's best-guess corrected spelling for a likely typo. If Gemini isn't reasonably confident, it returns `null` rather than guessing — no suggestion is better than a bad one.

## Gemini prompt & schema changes (`lib/gemini.ts`)

- Extend `responseSchema` to match the data model above (new `Type.ARRAY`/`Type.STRING` fields on each entry, plus word-level `ipa` and `suggestion`).
- Update `SYSTEM_INSTRUCTION` to ask for: up to 5 synonyms and up to 5 antonyms per sense (empty array if none fit naturally — don't force weak matches); a short usage note per sense when the word has a notable register, otherwise null; a word-level IPA transcription (null if genuinely unclear, e.g. for unusual proper nouns); and, on a not-found result, a single best-guess corrected spelling in `suggestion` only when reasonably confident it's what the user meant, otherwise null.
- Model stays **Gemini Flash Lite** — no tier upgrade in this pass. Etymology-adjacent accuracy risk (IPA correctness, synonym quality) is accepted as inherent to any LLM-generated dictionary, not something this pass fixes.

## API & cache (`app/api/define/route.ts`, `lib/definitions-cache.ts`)

No structural changes — both already pass the full `DefinitionResult` through opaquely. The new fields flow through automatically.

**Cache migration is explicitly not designed for.** The app has no real deployment/users yet, so existing cached docs are disposable. After this ships, a stale cached doc (from before this pass) simply won't have `synonyms`/`antonyms`/`usageNote`/`ipa`/`suggestion` — the UI must treat all of these as always-possibly-absent and render nothing for them, not error. If this app gets real users before a future richer pass, cache versioning should be revisited then.

## UI (`components/dictionary-search.tsx`)

**Refactor first:** extract the current form-submit logic into a `runSearch(word: string)` function. It becomes the single entry point for: the form's submit handler, clicking a synonym/antonym chip, and clicking a "did you mean" suggestion. Each of these sets the search input to `word` and calls `runSearch(word)`.

**Word-level pronunciation line**, shown once near the headword (not per entry):
- The IPA string (if present), styled as secondary text next to the headword — e.g. `ephemeral /ɪˈfɛmərəl/`.
- A speaker icon button next to it that calls `window.speechSynthesis.speak(new SpeechSynthesisUtterance(word))`.
- Feature-detect `'speechSynthesis' in window` on mount; if unsupported, don't render the button at all (not a disabled state — just absent).
- Toggle the icon between "play" and "playing" using the utterance's `onstart`/`onend` handlers, so repeated clicks don't stack overlapping audio.

**Per-entry additions**, inline/stacked below the existing badge/definition/example (no collapse/expand — matches today's card density):
- A synonyms row: a `Badge` per synonym (e.g. `variant="outline"`), each clickable → `runSearch(synonym)`. Omit the row entirely if `synonyms` is empty.
- An antonyms row: same pattern, visually distinguished from synonyms (e.g. a different badge variant or a preceding label), omitted if empty.
- A usage note line (e.g. small italic/muted text), omitted if `null`.

**Not-found state additions:**
- When `suggestion` is present, add a clickable chip/link: `Did you mean "<suggestion>"?` → `runSearch(suggestion)`. This **never auto-redirects** — the user must click it. Omit entirely when `suggestion` is `null`.

## Edge cases

- **Browser TTS doesn't respect our IPA.** `speechSynthesis` reads the plain word using the browser's own pronunciation engine — it may not match the IPA we display. This is a known, accepted inconsistency for this pass, not a bug to chase.
- **No audio support.** Older/unusual browsers may lack `speechSynthesis`. Feature-detect and hide the button; never show a broken control.
- **Clicking a hallucinated synonym/antonym.** If Gemini generated a synonym that isn't actually a real word, clicking it just runs the normal lookup pipeline and gets the existing graceful not-found state. This is an acceptable degraded outcome — no special-casing needed.
- **Self-referential clicks.** Clicking a synonym identical to the current word just re-runs the same (likely cached) lookup — harmless, no special-casing needed.
- **Heteronyms.** A single word-level pronunciation may be "wrong" for a less-common sense (e.g. showing the noun stress for "record" when the verb sense is what the user meant). Accepted simplification for this pass.
- **Increased per-lookup cost/latency.** Richer responses mean more Gemini output tokens per call than today's basic lookups. This compounds the already-deferred "no abuse/cost guardrail" gap noted in `README.md` — still not addressed here.

## Explicitly deferred (not in this pass)

- Etymology
- Related/confusable words as their own feature
- Gemini TTS or a third-party dictionary audio API (real recorded/generated audio instead of browser TTS)
- Cache schema versioning / migration strategy
- Cost/rate abuse guardrails
