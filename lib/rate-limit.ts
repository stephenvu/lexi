import { db } from "@/lib/firebase-admin"

const COLLECTION = "rateLimits"
const WINDOW_MS = 60 * 60 * 1000 // 1 hour
const MAX_PER_WINDOW = Number(process.env.RATE_LIMIT_MAX_PER_HOUR) || 20

export class RateLimitError extends Error {}

type RateLimitDoc = {
  count: number
  windowStart: number // epoch ms — internal bookkeeping only, never queried/sorted, so a plain number rather than a Firestore Timestamp
}

/**
 * Per-IP rate limit on Gemini calls (cache-miss lookups only — this is
 * gating cost, not traffic, so cache hits never touch this). A safety net
 * against a runaway bill, not attacker-resistant: IP-based limiting is
 * approximate (shared IPs, spoofable proxy headers) by nature.
 *
 * Skipped entirely outside production — a cost concern for a deployed app,
 * not something that should ever throttle local development.
 */
export async function checkRateLimit(ip: string): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    return
  }

  const ref = db.collection(COLLECTION).doc(ip)
  const now = Date.now()

  const allowed = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref)
    const data = snapshot.exists ? (snapshot.data() as RateLimitDoc) : null

    const windowExpired = !data || now - data.windowStart >= WINDOW_MS
    const count = windowExpired ? 1 : data.count + 1
    const windowStart = windowExpired ? now : data.windowStart

    tx.set(ref, { count, windowStart } satisfies RateLimitDoc)

    return count <= MAX_PER_WINDOW
  })

  if (!allowed) {
    throw new RateLimitError(
      "You've made a lot of new lookups recently — try again in a bit."
    )
  }
}
