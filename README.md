# Lexi

An AI-powered English dictionary for language learners, built with Next.js and Gemini Flash Lite.

**Live:** [lexi--lexi-gemini.asia-southeast1.hosted.app](https://lexi--lexi-gemini.asia-southeast1.hosted.app)

See [`CLAUDE.md`](./CLAUDE.md) for how the pieces fit together (Gemini integration, the Firestore cache, the API route, and the UI).

## Features

### Current (shipped)

- **AI-generated definitions** — Gemini Flash Lite generates each definition on demand instead of querying a static dictionary database.
- **Structured results** — each sense returned with its part of speech, a one-sentence definition, and one example sentence (up to 5 senses per word).
- **Graceful "not found" handling** — gibberish/unrecognized input gets a distinct empty state with an explanation, not an error.
- **Cached lookups** — results are cached in Firestore by normalized word, so repeat lookups of the same word are near-instant instead of re-calling Gemini.
- **Deliberate search-on-submit** — looks up on Enter/click only (never live-as-you-type), avoiding a Gemini call per keystroke; a new search cancels a still-in-flight one.
- **Richer lookups** — synonyms/antonyms, pronunciation (IPA + audio), usage notes, "did you mean" fallback for typos.
- **Difficulty indicator** — each word labeled with its CEFR level (A1–C2), returned by Gemini as part of the same definition response. Shown on both the search result card and flashcards.
- **Bilingual definitions** — each sense's definition also translated into a second language (Vietnamese by default), returned by Gemini as part of the same response. Hardcoded for now via `SECOND_LANGUAGE`; a future Settings page would make it user-configurable.
- **Saved words & history** — favorite words (starred, pinned) and a running history of recent lookups, shown as clickable chips below the search box. Local-only (`localStorage`), not synced across devices.
- **Study features** — a word-of-the-day drawn from your favorites, and a `/study` flashcard deck through them. See `specs/study-features.md`.
- **Cost safety net** — new-word lookups (the ones that actually call Gemini; repeat/cached lookups are unaffected) are rate-limited per IP in production, since this is a public search box with no accounts. A safety net against a runaway bill, not attacker-resistant abuse prevention — see the "Cost safety net" note under Deploy below.

### Planned / beyond current MVP scope

Deliberately left out of the first build to keep scope tight — listed here as a roadmap, not a promise:

- **Etymology & related/confusable words** — deferred from the Richer Lookups pass; see `specs/richer-lookups.md`.
- **Accounts & cross-device sync** — would replace today's local-only history/favorites.
- **Settings page** — user-configurable second language for bilingual definitions (currently hardcoded to Vietnamese via `SECOND_LANGUAGE`), and a per-user replacement for today's env-var-only config.
- **Firebase App Check** — a stronger, attacker-resistant anti-abuse layer than the current per-IP rate limit, at the cost of the app's first client-side Firebase SDK dependency plus a reCAPTCHA registration.

## Prerequisites

- A [Firebase project](https://console.firebase.google.com/) with **Firestore** enabled (Native mode).
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).

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
   # Optional — the second language for bilingual definitions. Defaults to
   # Vietnamese. Only applies to newly-generated (cache-miss) lookups.
   SECOND_LANGUAGE=Vietnamese
   ```
3. Set up local Firestore credentials via Application Default Credentials:
   ```bash
   gcloud auth application-default login
   ```
   `GOOGLE_CLOUD_PROJECT` above is required alongside this — user ADC credentials (unlike a service account) don't carry a project id on their own.
4. `.firebaserc` already points at this project's Firebase project (`lexi-gemini`) and the live backend is deployed there via GitHub — replace the project id here only if you're deploying your own copy under a different Firebase project.

## Run

```bash
npm run dev
```

Open [http://localhost:3333](http://localhost:3333) (the dev server runs on port 3333 — see `package.json`) and look up a word.

## Deploy

This app targets [Firebase App Hosting](https://firebase.google.com/docs/app-hosting) (config in `apphosting.yaml`/`firebase.json`), and the backend is connected to this repo on GitHub — **pushing to `main` triggers an automatic build and rollout**. No manual deploy step for day-to-day changes.

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
