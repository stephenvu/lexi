// Seeds data/words.json (the Oxford-3000 dataset built by build_dictionary.js)
// into Firestore as pre-warmed `definitions/{word}` cache docs — same
// collection/shape lib/definitions-cache.ts reads from, so common words
// resolve instantly with zero Gemini cost on first real lookup.
//
// A plain .mjs script (not TS) run standalone outside the Next app, same
// convention as build_dictionary.js — this repo's package.json has no
// "type": "module", so .mjs (rather than a bare .js) is what makes `import`
// work without touching that global setting.
//
// Usage:
//   node scripts/upload-words.mjs --dry-run   # parse/validate only, no Firestore, no credentials needed
//   node scripts/upload-words.mjs             # real writes; skips docs that already exist
//   node scripts/upload-words.mjs --overwrite # real writes; overwrites existing docs too
//
// Needs the same Firestore credentials `npm run dev` does (see README.md's
// Setup section): GOOGLE_CLOUD_PROJECT + `gcloud auth application-default
// login` locally, or GOOGLE_APPLICATION_CREDENTIALS pointing at a service
// account JSON.

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_FILE = path.join(__dirname, "..", "data", "words.json")

// Provenance for seeded docs — lets these be told apart from live,
// Gemini-generated cache entries later if ever needed.
const SEED_MODEL = "gemini-3.5-flash-lite"
const SEED_SOURCE = "seed:oxford-3000"

const PROGRESS_INTERVAL = 200

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    overwrite: argv.includes("--overwrite"),
  }
}

// Same normalization as lib/gemini.ts's normalizeWord() + the cache's
// .toLowerCase() — a seeded doc's ID must match exactly what a real lookup
// of that word will query.
function toDocId(word) {
  return word.trim().replace(/\s+/g, " ").toLowerCase()
}

function loadDataset() {
  const raw = fs.readFileSync(DATA_FILE, "utf-8")
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected ${DATA_FILE} to contain a JSON array`)
  }
  return parsed
}

/** Validates + shapes one dataset entry into a definitions/{word} doc. Returns null (and warns) if the entry is unusable. */
function toCacheDoc(entry) {
  if (!entry || typeof entry.word !== "string" || !entry.word.trim()) {
    console.warn("Skipping entry with no word:", JSON.stringify(entry).slice(0, 120))
    return null
  }
  if (!Array.isArray(entry.entries) || entry.entries.length === 0) {
    console.warn(`Skipping "${entry.word}": empty/missing entries array`)
    return null
  }

  return {
    word: entry.word,
    found: true,
    message: null,
    ipa: entry.ipa ?? null,
    syllables: entry.syllables ?? null,
    cefrLevel: entry.cefrLevel ?? null,
    suggestion: null,
    entries: entry.entries.map((sense) => ({
      partOfSpeech: sense.partOfSpeech,
      definition: sense.definition,
      example: sense.example,
      synonyms: sense.synonyms ?? [],
      antonyms: sense.antonyms ?? [],
      usageNote: sense.usageNote ?? null,
    })),
    tags: entry.tags ?? [],
    model: SEED_MODEL,
    source: SEED_SOURCE,
  }
}

async function runDryRun(docs) {
  console.log(`[dry-run] ${docs.length} valid docs ready to seed (no Firestore calls made).`)
  console.log("[dry-run] Sample doc:")
  console.log(JSON.stringify({ id: toDocId(docs[0].word), ...docs[0] }, null, 2))

  const ids = new Set()
  let collisions = 0
  for (const doc of docs) {
    const id = toDocId(doc.word)
    if (ids.has(id)) collisions++
    ids.add(id)
  }
  console.log(`[dry-run] Unique doc IDs: ${ids.size} (${collisions} collisions among input words)`)
}

async function runUpload(docs, { overwrite }) {
  // Imported lazily so --dry-run never needs firebase-admin credentials
  // resolved at all.
  const { applicationDefault, getApps, initializeApp } = await import("firebase-admin/app")
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore")

  // Same credential resolution as lib/firebase-admin.ts, inlined here since
  // that module is TS and this is a standalone plain-Node script.
  const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT
  const app =
    getApps()[0] ??
    (projectId
      ? initializeApp({ credential: applicationDefault(), projectId })
      : initializeApp())
  const db = getFirestore(app)

  const collection = db.collection("definitions")
  const bulkWriter = db.bulkWriter()

  let created = 0
  let skippedExisting = 0
  let errors = 0

  bulkWriter.onWriteError((error) => {
    if (error.code === 6 /* ALREADY_EXISTS */) {
      skippedExisting++
      return false // don't retry — this is an expected "already cached" skip, not a transient failure
    }
    errors++
    console.error(`Write failed for "${error.documentRef.id}":`, error.message)
    return error.failedAttempts < 3
  })

  let processed = 0
  for (const doc of docs) {
    const ref = collection.doc(toDocId(doc.word))
    const data = { ...doc, createdAt: FieldValue.serverTimestamp() }

    const write = overwrite ? bulkWriter.set(ref, data) : bulkWriter.create(ref, data)
    // A write onWriteError decides not to retry (e.g. our ALREADY_EXISTS
    // skip) rejects this promise — already logged/counted there, so the
    // rejection handler here is just to prevent an unhandled-rejection
    // warning, not a second place to react to it.
    write.then(
      () => created++,
      () => {}
    )

    processed++
    if (processed % PROGRESS_INTERVAL === 0) {
      console.log(`Queued ${processed}/${docs.length}...`)
    }
  }

  await bulkWriter.close()

  console.log("\nDone.")
  console.log(`  Created:           ${created}`)
  console.log(`  Skipped (existing): ${skippedExisting}`)
  console.log(`  Errors:            ${errors}`)
}

async function main() {
  const { dryRun, overwrite } = parseArgs(process.argv.slice(2))

  const dataset = loadDataset()
  const docs = dataset.map(toCacheDoc).filter(Boolean)
  console.log(`Loaded ${dataset.length} entries from ${DATA_FILE}, ${docs.length} valid.`)

  if (dryRun) {
    await runDryRun(docs)
    return
  }

  await runUpload(docs, { overwrite })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
