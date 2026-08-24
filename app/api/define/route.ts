import { getDefinition } from "@/lib/definitions-cache"
import { auth } from "@/lib/firebase-admin"
import { InvalidWordError } from "@/lib/gemini"
import { RateLimitError } from "@/lib/rate-limit"
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie"

// proxy.ts already gates page navigation, but its matcher deliberately
// excludes /api/* (a redirect makes no sense for a fetch call) — so this
// route verifies the session cookie itself, independent of that gate, and
// uses the resulting uid both to authorize the request and to key the
// per-user rate limit below.
async function verifySession(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get("cookie") ?? ""
  const sessionCookie = cookieHeader
    .split(";")
    .map((pair) => pair.trim())
    .find((pair) => pair.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1)

  if (!sessionCookie) {
    return null
  }

  try {
    const decoded = await auth.verifySessionCookie(sessionCookie)
    return decoded.uid
  } catch {
    return null
  }
}

// Uses the Web-standard Request/Response APIs (rather than NextRequest/
// NextResponse) since those are stable regardless of this project's
// non-standard Next.js version — see AGENTS.md.
export async function GET(request: Request) {
  const uid = await verifySession(request)
  if (!uid) {
    return Response.json({ status: "error", message: "Sign-in required." }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const word = searchParams.get("word") ?? ""

  try {
    const result = await getDefinition(word, uid)
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
