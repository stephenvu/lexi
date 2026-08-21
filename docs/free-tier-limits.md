# Free-tier limits: Firebase, App Hosting, Google Translate, Gemini API

Research reference, current as of August 2026. Figures are sourced from official pricing pages where possible; secondary sources are flagged as such. Free tiers change — re-verify before relying on this for a real budget decision.

## Firebase Spark (free) plan

Source: [firebase.google.com/pricing](https://firebase.google.com/pricing)

| Service | Free limit |
|---|---|
| Cloud Firestore — document reads | 50,000/day |
| Cloud Firestore — document writes | 20,000/day |
| Cloud Firestore — document deletes | 20,000/day |
| Cloud Firestore — stored data | 1 GiB total |
| Cloud Firestore — network egress | 10 GiB/month |
| Firebase Hosting — storage | 10 GB |
| Firebase Hosting — data transfer | 360 MB/day |
| Authentication — MAUs (email/social) | 50,000 |
| Authentication — MAUs (SAML/OIDC) | 50 |
| Cloud Functions | **Not available on Spark** — the no-cost 2M invocations/month tier only exists once you're on Blaze |

## Firebase App Hosting — requires Blaze, no free-plan-only path

This is the nuance most worth getting right: unlike Firestore, Hosting, or Auth, **App Hosting is not available on the Spark plan at all.** Every App Hosting line item (bandwidth, storage, Cloud Run, Cloud Build, Artifact Registry, Cloud Logging, Secret Manager) is listed as "Not applicable" for Spark on the official pricing page — you must be on Blaze (pay-as-you-go) just to use App Hosting, regardless of how little you use it.

That said, Blaze itself still has generous no-cost allotments before anything is actually billed:

| Line item | No-cost allotment (Blaze) | Then |
|---|---|---|
| Outgoing bandwidth (uncached) | 10 GiB/month | $0.20/GiB |
| Outgoing bandwidth (cached) | *(none stated)* | $0.15/GiB |
| Storage | 5 GB | $0.10/GB |
| Cloud Run | *(own free tier — see below)* | Cloud Run rates |
| Cloud Build | *(own free tier — see below)* | Cloud Build rates |
| Artifact Registry / Cloud Logging / Secret Manager | Each has its own separate free tier | Their own rates |

App Hosting's actual compute and build cost rides on Cloud Run and Cloud Build under the hood, each of which has its own perpetual free tier:

- **Cloud Run**: 2,000,000 requests/month, 180,000 vCPU-seconds/month, 360,000 GiB-seconds/month — free every month, indefinitely. ([cloud.google.com/run/pricing](https://cloud.google.com/run/pricing))
- **Cloud Build**: 2,500 free build-minutes/month per the official pricing page (some secondary sources describe this as ~120 min/day, which is roughly consistent). ([cloud.google.com/build/pricing](https://cloud.google.com/build/pricing))

## Google Cloud Translation API

Source: [cloud.google.com/translate/pricing](https://cloud.google.com/translate/pricing) + corroborating search.

- **500,000 characters/month free** — Basic and Advanced editions **combined** (one shared pool, not 500K each).
- Beyond that: pay-per-character, roughly **$20 per million characters** on the Basic edition (Advanced adds pricier optional features like document/batch translation on top).
- **Now used by this app** (`lib/translate.ts`) — bilingual definitions call the Basic edition, one batched request per target language per new-word lookup (all of a word's senses translated in a single call, not one per sense, and cache hits don't call it at all). An earlier Gemini-based version of this was tried and removed before landing on this API instead. See the worked estimate below for expected scale.

## Gemini API rate limits (the model this app actually calls)

Source: [ai.google.dev/gemini-api/docs/rate-limits](https://ai.google.dev/gemini-api/docs/rate-limits) + search corroboration.

The official rate-limits page confirms the *shape* of the free tier but doesn't publish a static table for the exact `gemini-3.5-flash-lite` id this app defaults to (`GEMINI_MODEL` in `lib/gemini.ts`) — current numbers are only shown dynamically per-project in [Google AI Studio's rate-limit view](https://aistudio.google.com/rate-limit). What is confirmed:

- No billing account required for the free tier.
- Daily quotas (RPD) reset at midnight Pacific time.
- **Limits are per-project, not per-user** — shared across every visitor of the deployed app, not granted individually. This is the single most operationally important fact in this whole document (see below).

Closest documented reference points (ballpark, not confirmed exact for this specific model — treat as approximate):

- Gemini 3.1 Flash-Lite: 30 RPM, 1,500 RPD
- Gemini 3.5 Flash (standard, not Lite): 15 RPM, 1,500 RPD
- **Google cut free-tier quotas 50–80% on December 7, 2025.** Any older cached figures you find elsewhere (e.g. Gemini 2.0 Flash-Lite's commonly-cited 30 RPM / 1,500 RPD / 1M TPM) predate that cut and should be treated as stale.

### Why "per-project, not per-user" matters

Every other quota in this document (Firestore, App Hosting bandwidth/compute) is so large relative to any realistic usage that a single user — or even a fair number of them — barely registers. Gemini's RPD is different: it's a shared pool that only cache-miss lookups draw from (cache hits never call Gemini at all), and it scales with *total concurrent users*, not any one of them. At the ~1,500 RPD ballpark above, this app could support roughly **150 users each doing ~10 new-word lookups/day** before the free tier itself — not the app's own rate limiter — becomes the binding constraint. This is exactly why Lexi already has its own per-IP rate limit (`lib/rate-limit.ts`) and a documented Cloud Billing budget alert (`README.md`'s "Cost safety net" section) as guardrails: Gemini is the one quota here that actually scales with growth.

## Estimated usage for 1 active user/month — does the free tier cover it?

Assumption (adjust as needed): a fairly active learner doing **~10 new-word lookups (cache misses) + ~20 repeat/review lookups (cache hits — recent-word chips, flashcard pre-fetch, word-of-the-day) + ~5 page visits**, every day, for 30 days.

**Firestore** (Spark, quotas reset daily):
| Metric | Daily usage | Free quota | % used |
|---|---|---|---|
| Reads (30 cache-checks + 10 rate-limit-transaction reads on misses) | 40/day | 50,000/day | ~0.08% |
| Writes (10 cache writes + 10 rate-limit writes on misses) | 20/day | 20,000/day | ~0.1% |
| Storage (≈10 new cached docs/day × ~2 KB) | ≈600 KB/month added | 1 GiB total | negligible |
| Egress (30 lookups/day × ~3 KB avg response) | ≈2.7 MB/month | 10 GiB/month | ~0.03% |

**App Hosting** (Blaze, since Spark doesn't apply at all here):
| Metric | Monthly usage | Free quota | % used |
|---|---|---|---|
| Bandwidth (5 visits/day × ~300 KB, browser caching shrinks repeat visits) | ≈45 MB/month | 10 GiB/month | ~0.4% |
| Cloud Run compute (35 requests/day × ~0.3s avg) | ≈315 vCPU-s/month | 180,000 vCPU-s/month | ~0.2% |
| Cloud Build | Not usage-driven — tied to deploy frequency. Even dozens of deploys/month stay well inside 2,500 free build-minutes. | | |

**Gemini API:** one user's ~10 new-word lookups/day is trivial against even the reduced ~1,500 RPD ballpark. But — per the nuance above — this quota doesn't stay negligible as *total* user count grows the way Firestore/App Hosting's do; it's shared project-wide.

**Google Cloud Translation API:** 10 new-word lookups/day × ~2 senses/word average × ~150 characters per `"word - definition"` string × 1 target language (`vi`, the default) ≈ 3,000 characters/day ≈ 90,000 characters/month — about 18% of the 500K/month free pool, from a single active user. Same "shared per-project, not per-user" caveat as Gemini above applies once usage grows beyond one user.

### Conclusion

For Firestore and App Hosting: **yes, comfortably**, by roughly 2–3 orders of magnitude of headroom for a single active user — those were never going to be the bottleneck at this app's scale. Translation lands in between: comfortable at ~18% of quota for one user, but — like Gemini — it's a shared per-project pool, not per-user, so it's worth watching as usage grows rather than assuming it stays negligible. For Gemini itself: a single user is also a non-issue, but it's the quota most likely to bind first at scale, which is exactly what the app's existing per-IP rate limit and billing-alert guardrails (see `README.md`) are for.
