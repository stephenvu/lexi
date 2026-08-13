import { getDefinition } from "@/lib/definitions-cache"
import { InvalidWordError } from "@/lib/gemini"
import { RateLimitError } from "@/lib/rate-limit"

// x-forwarded-for's first entry — Cloud Run/App Hosting set this in
// production, so "unknown" (a shared fallback bucket) is a defensive
// fallback, not the expected path. Spoofable by a motivated client; this is
// a safety net against a runaway bill, not attacker-resistant IP detection.
function getClientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
}

// Uses the Web-standard Request/Response APIs (rather than NextRequest/
// NextResponse) since those are stable regardless of this project's
// non-standard Next.js version — see AGENTS.md.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const word = searchParams.get("word") ?? ""

  try {
    const result = await getDefinition(word, getClientIp(request))
    return Response.json({ status: "ok", data: result })
  } catch (error) {
    if (error instanceof InvalidWordError) {
      return Response.json({ status: "error", message: error.message }, { status: 400 })
    }

    if (error instanceof RateLimitError) {
      return Response.json({ status: "error", message: error.message }, { status: 429 })
    }

    console.error("Failed to look up definition:", error)
    return Response.json(
      { status: "error", message: "Something went wrong looking up that word." },
      { status: 502 }
    )
  }
}
