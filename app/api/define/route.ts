import { getDefinition } from "@/lib/definitions-cache"
import { InvalidWordError } from "@/lib/gemini"

// Uses the Web-standard Request/Response APIs (rather than NextRequest/
// NextResponse) since those are stable regardless of this project's
// non-standard Next.js version — see AGENTS.md.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const word = searchParams.get("word") ?? ""

  try {
    const result = await getDefinition(word)
    return Response.json({ status: "ok", data: result })
  } catch (error) {
    if (error instanceof InvalidWordError) {
      return Response.json({ status: "error", message: error.message }, { status: 400 })
    }

    console.error("Failed to look up definition:", error)
    return Response.json(
      { status: "error", message: "Something went wrong looking up that word." },
      { status: 502 }
    )
  }
}
