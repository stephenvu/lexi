// Minimal service worker — exists only to satisfy PWA installability
// criteria (Chrome's automatic install prompt wants a registered service
// worker with a fetch handler). Deliberately does nothing: no
// respondWith() means every request still goes straight to the network,
// so there's no caching/offline behavior and no risk of serving stale
// content. See specs/ for a future pass if real offline support is wanted.
self.addEventListener("fetch", () => {})
