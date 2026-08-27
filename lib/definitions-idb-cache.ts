"use client";

import type { DefinitionResult } from "@/lib/gemini";

// Client-side read-through cache in front of /api/define, keyed by
// `${normalizedWord}:${lang}` — each (word, language) pair is cached as its
// own independent blob (not word-only, unlike lib/definitions-cache.ts's
// Firestore doc, which accumulates every language's translations into one
// doc over time). Every current call site only ever renders the single
// translation matching the user's current targetLanguage and discards the
// rest, so this simpler keying matches actual read patterns, at the cost of
// not sharing word-only fields (definition/example/synonyms, invariant
// across languages) between two different languages' cache entries for the
// same word.
//
// No TTL/expiry and no envelope/metadata wrapper around the stored value —
// matches lib/definitions-cache.ts's own permanent-cache model server-side
// (both `found: true` and `found: false` results are stable facts about a
// word, not request-scoped). Bump DB_VERSION and add an onupgradeneeded
// migration if a wrapper/TTL is ever needed later.
//
// Every failure mode (DB unsupported, blocked, quota-exceeded, corrupt
// entry) is caught and treated as a cache miss, falling back to network —
// this cache is a pure optimization and must never break a lookup.

const DB_NAME = "lexi-definitions";
const DB_VERSION = 1;
const STORE_NAME = "definitions";

type DefineResponse =
  | { status: "ok"; data: DefinitionResult }
  | { status: "error"; message: string };

// Mirrors lib/gemini.ts's normalizeWord() + lib/definitions-cache.ts's own
// .toLowerCase() key derivation, so a client cache key for a given word
// always lines up with what the server would treat as the same word.
function cacheKey(word: string, lang: string): string {
  const normalized = word.trim().replace(/\s+/g, " ").toLowerCase();
  return `${normalized}:${lang}`;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

// Memoized module-level singleton so every caller shares one open
// connection rather than racing separate opens. Resolves to null — never
// rejects — on any failure, so downstream code treats "no IndexedDB" as
// just another cache miss.
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      console.error("Failed to open definitions cache DB:", error);
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME); // out-of-line key (no keyPath)
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // If a future version bump happens in another tab, don't keep serving
      // this stale connection as the memoized singleton — force a re-open.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      console.error("Failed to open definitions cache DB:", request.error);
      resolve(null);
    };

    // Only relevant if DB_VERSION is ever bumped while another tab holds an
    // older-version connection open — a no-op in practice for v1's
    // never-bumped version 1, but resolve(null) rather than hang forever
    // if it ever does fire, matching this module's "never block the
    // primary lookup" contract.
    request.onblocked = () => {
      console.error("Definitions cache DB open blocked by another tab");
      resolve(null);
    };
  });

  return dbPromise;
}

async function readFromCache(key: string): Promise<DefinitionResult | null> {
  const db = await openDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const request = db
        .transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .get(key);
      request.onsuccess = () => {
        resolve((request.result as DefinitionResult | undefined) ?? null);
      };
      request.onerror = () => {
        console.error("Failed to read definitions cache:", request.error);
        resolve(null);
      };
    } catch (error) {
      console.error("Failed to read definitions cache:", error);
      resolve(null);
    }
  });
}

async function writeToCache(key: string, data: DefinitionResult): Promise<void> {
  const db = await openDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(data, key);
      // Resolve on transaction completion, not the individual put request's
      // onsuccess — that only means the request was queued, not that the
      // transaction actually committed.
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        // Covers QuotaExceededError and any other write failure. A write
        // failure is never surfaced — the network response was already
        // returned to the caller regardless.
        console.error("Failed to write definitions cache:", tx.error);
        resolve();
      };
      tx.onabort = () => {
        console.error("Definitions cache write aborted:", tx.error);
        resolve();
      };
    } catch (error) {
      console.error("Failed to write definitions cache:", error);
      resolve();
    }
  });
}

/**
 * Read-through cache in front of GET /api/define. On a cache hit, returns
 * the cached DefinitionResult with no network call. On a miss, performs the
 * identical fetch the call sites did before this module existed (same URL
 * shape, same `options.signal` passthrough), and on a `status: "ok"`
 * response, writes it to IndexedDB (best-effort, never throws on write
 * failure). Returns the response body verbatim in both cases, so existing
 * `body.status === "ok" ? body.data : null` caller logic needs no changes.
 *
 * Honors `options.signal` the same way a real `fetch()` would — including
 * on a cache hit, which never touches `fetch()` at all — so callers that
 * rely solely on a thrown AbortError (rather than checking
 * `signal.aborted` after the fact) keep working unmodified even when the
 * result came from cache instead of the network.
 */
export async function fetchCachedDefinition(
  word: string,
  lang: string,
  options?: { signal?: AbortSignal }
): Promise<DefineResponse> {
  const { signal } = options ?? {};
  throwIfAborted(signal);

  const key = cacheKey(word, lang);
  const cached = await readFromCache(key);
  throwIfAborted(signal);

  if (cached) {
    return { status: "ok", data: cached };
  }

  const response = await fetch(
    `/api/define?word=${encodeURIComponent(word)}&lang=${encodeURIComponent(lang)}`,
    { signal }
  );
  const body = (await response.json()) as DefineResponse;

  if (body.status === "ok") {
    writeToCache(key, body.data).catch((error) => {
      console.error(`Failed to cache definition for "${key}":`, error);
    });
  }

  return body;
}
