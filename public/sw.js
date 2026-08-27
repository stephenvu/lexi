// Minimal service worker — exists mostly to satisfy PWA installability
// criteria (Chrome's automatic install prompt wants a registered service
// worker with a fetch handler). Almost every request still passes straight
// to the network untouched: no caching/offline behavior, no risk of
// serving stale app-shell/API content. See specs/ for a future pass if
// broader offline support is wanted.
//
// One deliberate, narrow exception: pronunciation audio from Oxford
// Learner's Dictionaries (requested by lib/use-speech.ts's getOxfordAudioUrl)
// is cache-first. Flashcard study repeats the same word's audio several
// times in a row (components/study-flashcards.tsx's repeat-playback
// toggle) — caching it here means repeat plays are instant and don't
// re-hit Oxford's CDN every time. Oxford's server sends no CORS header, so
// a page-side fetch() would only ever get an unusable opaque response; a
// service worker's respondWith() is the standard way to still cache (and
// later serve) an opaque cross-origin response for media playback.
const AUDIO_CACHE_NAME = "lexi-audio-v1"
const AUDIO_HOST = "www.oxfordlearnersdictionaries.com"
const AUDIO_PATH_PREFIX = "/media/english/uk_pron/"

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)
  if (url.host !== AUDIO_HOST || !url.pathname.startsWith(AUDIO_PATH_PREFIX)) {
    return // everything else: untouched passthrough, as before
  }

  // <audio> elements often load a resource via one or more Range-header
  // sub-requests (duration probing, then filling in the rest) rather than
  // a single plain GET — Oxford's CDN advertises Accept-Ranges: bytes, so
  // browsers are free to do this. The Cache API has no concept of partial
  // content: it doesn't slice a stored response to satisfy a different
  // byte range, and matches purely by URL, ignoring the Range header. So
  // keying cache reads/writes off event.request directly (which carries
  // whatever Range that particular sub-request happened to use) means a
  // later, differently-ranged sub-request can match an earlier request's
  // too-small cached slice — the browser never gets the bytes it actually
  // asked for and retries the load forever, which looks like the audio
  // source being fetched endlessly. These files are tiny (~15-20KB), so
  // the simple fix is to ignore Range entirely: always fetch/cache/serve
  // the FULL resource under a headerless request keyed only by URL.
  // Browsers handle a full response to a ranged request just fine.
  const cacheKey = new Request(url.toString(), { method: "GET" })

  event.respondWith(
    caches.open(AUDIO_CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(cacheKey)
      if (cached) return cached

      const response = await fetch(cacheKey)
      // Cache regardless of status — cross-origin, no-CORS requests come
      // back opaque (status can't be inspected either way), so caching a
      // 404 is harmless: lib/use-speech.ts's own onerror fallback to Web
      // Speech still fires the same way on the next play.
      cache.put(cacheKey, response.clone())
      return response
    }),
  )
})
