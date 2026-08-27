# Spec: Client-side definitions cache

Status: Implemented.

## Motivation

`/api/define` already has a permanent, read-through Firestore cache server-side (`lib/definitions-cache.ts`), so a repeat lookup never re-bills Gemini. But every lookup — cached or not — still costs a full network round-trip plus a Firestore read on every single visit, including cases with no new information at all: reviewing the same saved words in a Study session, revisiting Library's Saved list, or looking up a word already looked up before. A browser-side IndexedDB cache in front of `/api/define` eliminates that round-trip entirely for repeat views within the same browser, with zero server-side changes.

Note: this is a latency/Firestore-read win, not a rate-limit one — `getDefinition()` already returns from `readCache()` before `checkRateLimit()` is ever called, so a server-side cache hit was already free of rate-limit cost. The client cache's value is purely in skipping the round-trip itself.

## Data model

- `lib/definitions-idb-cache.ts` — one IndexedDB database (`lexi-definitions`, version 1), one object store (`definitions`), out-of-line key `` `${normalizedWord}:${lang}` `` → raw `DefinitionResult` value.
- Keyed by word **and** language, unlike the server's Firestore doc (word-only, accumulating every language's translations into the same doc over time). Every current client read site only ever renders the single translation matching the active `targetLanguage` and discards the rest, so this simpler per-language keying matches actual usage — the trade-off (no cross-language sharing of the language-invariant `definition`/`example`/`synonyms` fields) is an acceptable simplification given the expensive work is already cached permanently server-side.
- No per-uid scoping — definitions are word+lang scoped, not personal data, unlike `lib/use-user-doc.ts`'s per-uid Firestore cache.
- No TTL and no envelope/metadata wrapper around the stored value — matches the server cache's own permanent model (both `found: true` and `found: false` are stable facts about a word). Can be added later via a `DB_VERSION` bump if ever needed.

## Behavior

- `fetchCachedDefinition(word, lang, { signal })` is the sole export — a drop-in replacement for the raw `fetch(...).then(r => r.json())` pattern previously duplicated at three call sites (`components/word-detail.tsx`, `components/study-flashcards.tsx`, `app/library/page.tsx`), returning the identical response shape so existing `body.status === "ok" ? body.data : null` caller logic needed no changes.
- Cache hit → return immediately, no network call.
- Cache miss → identical fetch to `/api/define` as before; the response is cached only if `status === "ok"` (covers both `found:true` and `found:false` — never caches an `"error"` status, since those are transient/request-level failures, not facts about the word).
- `AbortSignal` is honored symmetrically on both the cache-hit and network path — checked on entry and again after the awaited IndexedDB read resolves, before returning a cache hit. This matters specifically for `word-detail.tsx`, the one call site that relies solely on a thrown `AbortError` (no independent post-await `signal.aborted` check) to bail out on cancellation.

## Edge cases

- IndexedDB unavailable, blocked (another tab holding an older DB version open), or quota-exceeded on write → always falls back to network / logs and drops the write; never throws, never blocks the primary lookup.
- `DefinitionResult`/`DefinitionEntry`/`Translation` are plain JSON-shaped data (`string | boolean | string[] | null`, no `Date`/`Map`/functions) — fully `structuredClone`-safe for `IDBObjectStore.put`, unlike e.g. `lib/use-srs-cards.ts`'s `Card` type.
- `app/library/page.tsx`'s Saved list has never passed the user's real `targetLanguage` (it always defaulted to `"en"` via an omitted URL param) — this cache preserves that exact existing behavior, now passing `DEFAULT_TARGET_LANGUAGE` explicitly instead of omitting `lang`.

## Explicitly deferred

- No cross-language sharing of word-invariant fields — each `word:lang` pair is a fully independent cached blob.
- No cache invalidation/versioning beyond a manual `DB_VERSION` bump (no known scenario needs it yet — a Gemini-generated definition doesn't change after generation).
- No storage-quota eviction policy (LRU, max-entries cap, etc.) — dictionary entries are a few KB of JSON each; not worth the complexity until real-world usage shows it's needed.
- No request coalescing for concurrent same-key reads within a batch fetch — IndexedDB reads are cheap and local, and a concurrent cache-miss is already coalesced server-side (`lib/definitions-cache.ts`'s `coalesce()`).
- No UI-visible cache indicator or manual-clear control.
