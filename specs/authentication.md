# Authentication

## Summary

Google Sign-In, **required** to use the app at all. Bundles in what was previously listed as a separate planned feature — favorites, history, and SRS cards move from `localStorage` to per-user Firestore storage, so an account also gets cross-device sync. This is the app's first client-side Firebase SDK usage (previously only the server-side Admin SDK existed).

## Two separate mechanisms

1. **Firebase Auth client SDK** (`lib/firebase-client.ts`, `lib/use-auth.ts`) — the actual sign-in (`signInWithPopup` + Google), and what authorizes direct client → Firestore reads/writes for the per-user data (governed by `firestore.rules`).
2. **A session cookie** (`app/api/session/route.ts`, `proxy.ts`) — created server-side right after sign-in via the Admin SDK's `createSessionCookie`, independent of #1. Used to gate page navigation (redirect to `/login`, no flash of gated content) and to authorize `/api/define`. Client-only auth state can't gate a page load without a flash; a cookie readable at the server can.

These are deliberately separate: signing out clears both (`signOutUser()` for #1, `DELETE /api/session` for #2).

## Gating: `proxy.ts`

This Next.js version (16.3.0) deprecates the `middleware.ts`/Edge-runtime convention in favor of `proxy.ts`, which runs on the **Node.js runtime** — which is what makes it safe to call `firebase-admin` (a Node.js-only SDK, unusable in Edge middleware) directly inside it. `proxy.ts` performs real cryptographic verification of the session cookie (`auth.verifySessionCookie`), not just a presence check, and redirects to `/login` if it's missing or invalid. Its matcher excludes `/login`, `/api/*` (a redirect makes no sense for a `fetch` call — API routes self-verify and return 401 JSON instead), and static/PWA assets (`_next/*`, manifest, service worker, icons — installability shouldn't require a session).

`/api/define` (`app/api/define/route.ts`) verifies the session cookie itself, independently of `proxy.ts`, and uses the resulting `uid` both to authorize the request and to key the per-user rate limit (`lib/rate-limit.ts` — rekeyed from per-IP to per-`uid` as part of this change, since a real identity is now available and is strictly more meaningful than an IP address).

## Data model

One document per user, `users/{uid}`:

```ts
{
  favorites?: string[]
  history?: string[]
  srsCards?: Record<string, Card>  // ts-fsrs Card, keyed by word
}
```

A single doc rather than subcollections — this data is small, always read together, and single-writer (only its own owner ever touches it), so subcollections would be premature. `firestore.rules` grants owner-only read/write:

```
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

`definitions`/`rateLimits` are unrelated and stay deny-all (still Admin-SDK-only).

### `lib/use-user-doc.ts`

A shared, module-level `onSnapshot` subscription per signed-in `uid`, used internally by both hooks below — so a page using both favorites and SRS cards gets **one** Firestore realtime listener for the shared doc, not two. Same "module-level cache + listener set" shape `lib/use-persisted-list.ts` always had for `localStorage`; here it fronts Firestore instead.

### `lib/use-persisted-list.ts` / `lib/use-srs-cards.ts`

Rewritten to read/write the signed-in user's doc via `lib/use-user-doc.ts` instead of `localStorage`, **keeping their pre-existing exported function names and shapes** (`usePersistedList(field, opts)`, `useSrsCards()`) so consumer components needed only small additions, not rewrites — mainly handling the new `isLoading` flag (Firestore reads are async, unlike a synchronous `localStorage` read) and, in a couple of spots, reading a hook's callback through a `ref` inside an effect rather than putting it directly in that effect's dependency array — the callbacks' identity now depends on `uid`, which resolves asynchronously, so a naive dependency would refire the effect (and redundantly re-fetch) once auth settles.

Card dates (`due`, `last_review`) are real `Date` objects on write — Firestore stores them as `Timestamp`s natively, no manual ISO-string round-tripping the way `localStorage`/`JSON` needed — and are converted back from `Timestamp` to `Date` on read.

## First-sign-in migration (`lib/migrate-local-data.ts`)

Called from `app/login/page.tsx` right after a successful sign-in, before navigating into the app. Only does real work the **first** time this account signs in (its `users/{uid}` doc doesn't exist yet) — reads the old `lexi.favorites`/`lexi.history`/`lexi.srs` `localStorage` keys from this browser, seeds the new Firestore doc with them, then clears those keys. An existing anonymous user of the app doesn't silently lose their data at the sign-in wall; an account that already has real cloud data is never clobbered by whatever a browser happens to have locally.

## Prerequisites (Firebase Console — not achievable via any tool available to an agent)

- Enable **Google** under Authentication → Sign-in method, on the `lexi-gemini` project.
- Register a **Web app** for the project if none exists (Project Settings → General) and copy its config (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`) into `NEXT_PUBLIC_FIREBASE_*` env vars — public-safe values, but real ones have to come from the console.
- `firebase deploy --only firestore:rules` after any `firestore.rules` change — rules aren't part of the GitHub-triggered App Hosting rollout.

## Explicitly out of scope

- Email/password or any provider besides Google.
- Account linking / multiple providers per user.
- An admin/user-management surface.
- Firestore offline persistence (works fine without it; adds complexity around cache reconciliation this app doesn't need yet).
