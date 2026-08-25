// Seeds data/oxford-3000-deck.csv as a pre-loaded `decks/{deckId}` doc —
// a shared, read-only (per firestore.rules) word list any signed-in user
// can study via /study?deck={deckId}, on top of their own favorites.
//
// A plain .mjs script (not TS) run standalone outside the Next app, same
// convention as scripts/upload-words.mjs — this repo's package.json has no
// "type": "module", so .mjs (rather than a bare .js) is what makes `import`
// work without touching that global setting.
//
// Usage:
//   node scripts/upload-deck.mjs --dry-run   # parse/validate only, no Firestore, no credentials needed
//   node scripts/upload-deck.mjs             # real write; fails if the doc already exists
//   node scripts/upload-deck.mjs --overwrite # real write; overwrites an existing doc
//
// Needs the same Firestore credentials `npm run dev` does (see README.md's
// Setup section): GOOGLE_CLOUD_PROJECT + `gcloud auth application-default
// login` locally, or GOOGLE_APPLICATION_CREDENTIALS pointing at a service
// account JSON.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "..", "data", "oxford-3000-deck.csv");

const DECK_ID = "oxford-3000";
const DECK_NAME = "Oxford 3000";

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    overwrite: argv.includes("--overwrite"),
  };
}

/**
 * Parses `word,class,level` rows into a deduped, ordered list of unique
 * words. `class`/`level` aren't stored on the deck doc — real
 * definitions/CEFR ratings already come from the `definitions` collection
 * at render time, and a second, possibly-conflicting CEFR source per word
 * isn't worth it here. A word can legitimately appear on multiple rows
 * (different parts of speech, e.g. "about" as both adverb and
 * preposition) — the deck only cares about the headword.
 */
function parseWords(csvText) {
  const lines = csvText.split("\n").map((line) => line.trim()).filter(Boolean);
  const [header, ...rows] = lines;
  if (!header || !header.startsWith("word,")) {
    throw new Error(`Expected ${DATA_FILE} to start with a "word,..." header`);
  }

  const seen = new Set();
  const words = [];
  for (const row of rows) {
    const word = row.split(",")[0]?.trim().toLowerCase();
    if (!word || seen.has(word)) continue;
    seen.add(word);
    words.push(word);
  }
  return words;
}

function loadWords() {
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return parseWords(raw);
}

async function runDryRun(words) {
  console.log(`[dry-run] ${words.length} unique words parsed (no Firestore calls made).`);
  console.log(`[dry-run] Deck doc: decks/${DECK_ID}`);
  console.log(
    JSON.stringify({ name: DECK_NAME, words: words.slice(0, 10) }, null, 2).replace(
      "]",
      `, ... (${words.length} total)]`
    )
  );
}

async function runUpload(words, { overwrite }) {
  // Imported lazily so --dry-run never needs firebase-admin credentials
  // resolved at all.
  const { applicationDefault, getApps, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");

  // Same credential resolution as lib/firebase-admin.ts, inlined here since
  // that module is TS and this is a standalone plain-Node script.
  const projectId = "lexi-gemini";
  const app =
    getApps()[0] ??
    (projectId ? initializeApp({ credential: applicationDefault(), projectId }) : initializeApp());
  const db = getFirestore(app);

  const ref = db.collection("decks").doc(DECK_ID);
  const data = { name: DECK_NAME, words };

  if (overwrite) {
    await ref.set(data);
    console.log(`Wrote decks/${DECK_ID} (${words.length} words), overwriting if it existed.`);
    return;
  }

  try {
    await ref.create(data);
    console.log(`Created decks/${DECK_ID} (${words.length} words).`);
  } catch (error) {
    if (error.code === 6 /* ALREADY_EXISTS */) {
      console.log(`decks/${DECK_ID} already exists — skipped (pass --overwrite to replace it).`);
      return;
    }
    throw error;
  }
}

async function main() {
  const { dryRun, overwrite } = parseArgs(process.argv.slice(2));

  const words = loadWords();
  console.log(`Parsed ${words.length} unique words from ${DATA_FILE}.`);

  if (dryRun) {
    await runDryRun(words);
    return;
  }

  await runUpload(words, { overwrite });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
