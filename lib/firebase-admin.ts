import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

// Credentials auto-detect:
// - On Firebase App Hosting, the runtime provides both credentials and the
//   project id automatically.
// - Locally, `gcloud auth application-default login` (or
//   GOOGLE_APPLICATION_CREDENTIALS pointing at a service account JSON)
//   provides credentials, but user ADC credentials (unlike a service
//   account) don't carry a project id — so we resolve it explicitly from
//   GOOGLE_CLOUD_PROJECT/GCLOUD_PROJECT rather than relying on it being
//   inferred, which fails silently when it can't be.
const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT

function createApp() {
  if (projectId) {
    return initializeApp({ credential: applicationDefault(), projectId })
  }

  try {
    return initializeApp()
  } catch (error) {
    throw new Error(
      "Failed to initialize Firebase Admin: no project id could be resolved. " +
        "If you're running locally with `gcloud auth application-default login`, " +
        "set GOOGLE_CLOUD_PROJECT in .env.local (see .env.example).",
      { cause: error }
    )
  }
}

// getApps()[0] guards against re-initializing on Next.js dev hot-reload.
const app = getApps()[0] ?? createApp()

export const db = getFirestore(app)
