# Lexi

An AI-powered English dictionary for language learners, built with Next.js and Gemini Flash Lite.

See [`CLAUDE.md`](./CLAUDE.md) for how the pieces fit together (Gemini integration, the Firestore cache, the API route, and the UI).

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
   ```
3. Set up local Firestore credentials via Application Default Credentials:
   ```bash
   gcloud auth application-default login
   ```
   `GOOGLE_CLOUD_PROJECT` above is required alongside this — user ADC credentials (unlike a service account) don't carry a project id on their own.
4. Set your real Firebase project id in `.firebaserc` (currently a placeholder).

## Run

```bash
npm run dev
```

Open [http://localhost:3333](http://localhost:3333) (the dev server runs on port 3333 — see `package.json`) and look up a word.

## Deploy

This app targets [Firebase App Hosting](https://firebase.google.com/docs/app-hosting) (config in `apphosting.yaml`/`firebase.json`):

```bash
firebase apphosting:secrets:set GEMINI_API_KEY
firebase deploy --only apphosting
```

## Other commands

- `npm run build` — production build
- `npm run start` — run a production build
- `npm run lint` — ESLint
