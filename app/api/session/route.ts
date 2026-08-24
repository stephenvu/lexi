import { cookies } from "next/headers"

import { auth } from "@/lib/firebase-admin"
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie"

// Firebase's own hard cap for session cookies is 14 days.
const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

// Web-standard Request/Response (see AGENTS.md / app/api/define/route.ts's
// own note) — `cookies()` from next/headers is the one App Router API used
// here regardless, since setting a cookie from a Route Handler has no
// Web-standard equivalent.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const idToken = body?.idToken

  if (typeof idToken !== "string" || !idToken) {
    return Response.json({ status: "error", message: "Missing idToken" }, { status: 400 })
  }

  try {
    // createSessionCookie verifies the token itself (signature, expiry) as
    // part of minting the cookie — no separate verifyIdToken call needed.
    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE_MS,
    })

    const cookieStore = await cookies()
    cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
      maxAge: SESSION_MAX_AGE_MS / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    })

    return Response.json({ status: "ok" })
  } catch (error) {
    console.error("Failed to create session:", error)
    return Response.json(
      { status: "error", message: "Invalid or expired sign-in." },
      { status: 401 }
    )
  }
}

export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)
  return Response.json({ status: "ok" })
}
