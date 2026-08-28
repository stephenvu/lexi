# Lexi

An AI-powered English dictionary for language learners, built with Next.js and Gemini Flash Lite.

**Live:** [lexi--lexi-gemini.asia-southeast1.hosted.app](https://lexi--lexi-gemini.asia-southeast1.hosted.app)

See [`CLAUDE.md`](./CLAUDE.md) for how the pieces fit together (Gemini integration, the Firestore cache, the API route, and the UI).

## Features

- **AI-generated definitions** — [Gemini](https://ai.google.dev/) generates each definition on demand: part of speech, examples, synonyms/antonyms, IPA pronunciation with audio, a CEFR difficulty level, and "did you mean" suggestions for typos.
- **Bilingual translations** — see any definition in a language of your choice, not just English.
- **Google Sign-In** — saved words, lookup history, and every preference sync in real time across all your devices.
- **Spaced-repetition flashcards** — study your saved words or curated decks (e.g. Oxford 3000) with an [FSRS](https://github.com/open-spaced-repetition/ts-fsrs)-scheduled review queue, so only what's actually due shows up.
- **Light & dark mode** — matches your system by default, or pick one yourself.
- **Installable** — add Lexi to your home screen or desktop like a native app.
- **Fast, cached lookups** — repeat lookups are instant, cached both server- and client-side.

See [`CLAUDE.md`](./CLAUDE.md) and `specs/` for how each of these is actually built.

### Planned / beyond current MVP scope

Deliberately left out of the first build to keep scope tight — listed here as a roadmap, not a promise:

- **Etymology & related/confusable words** — deferred from the Richer Lookups pass; see `specs/richer-lookups.md`.
- **Firebase App Check** — a stronger, attacker-resistant anti-abuse layer than the current per-user rate limit, at the cost of a reCAPTCHA registration.

## Prerequisites

- A [Firebase project](https://console.firebase.google.com/) with **Firestore** enabled (Native mode).
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).
- Optional, for bilingual definitions: a [Cloud Translation API](https://console.cloud.google.com/apis/library/translate.googleapis.com) key (enable the API on your GCP project, then create/restrict an API key in Credentials). Lookups work fine without one — translations just come back empty.
- **Required**, for sign-in (the whole app is gated behind it — see `specs/authentication.md`):
  - Enable **Google** under Authentication → Sign-in method, on your Firebase project.
  - Register a **Web app** for the project if you don't have one yet (Project Settings → General → Your apps) and copy its config values — you'll need these for the `NEXT_PUBLIC_FIREBASE_*` env vars below.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env.local` in the project root (there's no `.env.example` to copy — see note in `CLAUDE.md`):
   ```
   GEMINI_API_KEY=your-key-here
   GEMINI_MODEL=gemini-3.5-flash-lite
   GOOGLE_CLOUD_PROJECT=your-firebase-project-id
   # Optional — new-word lookups per IP per hour before a 429. Defaults to
   # 20. Only enforced when NODE_ENV=production (never in local dev).
   RATE_LIMIT_MAX_PER_HOUR=20
   # Optional — omit to skip bilingual definitions entirely (lookups still
   # work fine, just with an empty `translations` array per sense). The
   # target language itself is a per-user Settings choice, not env config.
   GOOGLE_TRANSLATE_API_KEY=your-key-here
   # Required — from Firebase Console → Project Settings → your web app.
   # Public-safe values (they identify the project, not authorize anything
   # on their own — firestore.rules is the real access control), but real
   # values still have to come from the console.
   NEXT_PUBLIC_FIREBASE_API_KEY=your-key-here
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=lexi-gemini
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
   NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
   ```
3. Set up local Firestore credentials via Application Default Credentials:
   ```bash
   gcloud auth application-default login
   gcloud auth application-default set-quota-project lexi-gemini
   ```
   `GOOGLE_CLOUD_PROJECT` above is required alongside this — user ADC credentials (unlike a service account) don't carry a project id on their own.

   The second command matters specifically for sign-in: user ADC credentials have no quota project set by default, and `identitytoolkit.googleapis.com` (what `auth.createSessionCookie()` in `app/api/session/route.ts` calls) refuses to run without one — unlike the Firestore Admin SDK calls elsewhere in this app, which don't hit that requirement. Skipping it surfaces as sign-in succeeding (you'll see the user appear in Firebase Console → Authentication) while `/api/session` fails with a "quota project" error in the server log.
4. `.firebaserc` already points at this project's Firebase project (`lexi-gemini`) and the live backend is deployed there via GitHub — replace the project id here only if you're deploying your own copy under a different Firebase project.

## Run

```bash
npm run dev
```

Open [http://localhost:3333](http://localhost:3333) (the dev server runs on port 3333 — see `package.json`) and look up a word.

## Deploy

This app targets [Firebase App Hosting](https://firebase.google.com/docs/app-hosting) (config in `apphosting.yaml`/`firebase.json`), and the backend is connected to this repo on GitHub — **pushing to `main` triggers an automatic build and rollout**. No manual deploy step for day-to-day changes.

**`firestore.rules` is the one exception** — rules aren't part of the GitHub-triggered build. After changing them, deploy explicitly:

```bash
firebase deploy --only firestore:rules
```

### Setting secrets (Firebase CLI)

Secrets (like `GEMINI_API_KEY`) aren't part of the GitHub-triggered build — they live in Secret Manager and are managed separately, once up front and again whenever a value changes:

```bash
firebase apphosting:secrets:set GEMINI_API_KEY
```

This prompts for the value, stores it in Secret Manager, and normally grants the App Hosting backend's service account access automatically. If a rollout ever can't read a secret (there's a known rough edge in `firebase-tools` around this), grant access explicitly and redeploy:

```bash
firebase apphosting:secrets:grantaccess GEMINI_API_KEY --backend=lexi
```

A secret's *value* only takes effect on the **next rollout** — after setting or changing one, push a commit (or trigger a manual rollout from the Firebase Console) to pick it up.

The same applies to `GOOGLE_TRANSLATE_API_KEY` (`apphosting.yaml` already declares the binding) — it's genuinely optional in production too; without it, deployed lookups just skip bilingual definitions.

To deploy without going through GitHub (e.g. to test a change before pushing, or to redeploy after a secret change):

```bash
firebase deploy --only apphosting
```

### Cost safety net

The per-IP rate limit above caps *sustained* cost, but the only thing that caps spend regardless of any bug in the app's own logic is a [Cloud Billing budget](https://docs.cloud.google.com/billing/docs/how-to/budgets) on the underlying GCP project:

1. In the Cloud Console, create a budget against this project's billing account with email alerts at a few thresholds (e.g. 50%/90%/100% of whatever monthly figure you're comfortable with). Five minutes, zero code.
2. Optional, more aggressive: wire the budget to a Pub/Sub topic and a small Cloud Function that calls the Cloud Billing API to detach the project from billing once a hard cap is hit — a real kill switch, but it takes down the whole Firebase project (Firestore included), not just Gemini calls. Only worth it if you want a true hard stop rather than an alert.

## Other commands

- `npm run build` — production build
- `npm run start` — run a production build
- `npm run lint` — ESLint
