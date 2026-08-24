import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { auth } from "@/lib/firebase-admin"
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie"

// This app's Next.js version (16.3.0) deprecates middleware.ts's Edge
// runtime in favor of this file — proxy.ts, running on the Node.js
// runtime — which is what makes it safe to use firebase-admin (a
// Node.js-only SDK, unusable in Edge middleware) directly here for real
// cryptographic session-cookie verification, not just a presence check.
export async function proxy(request: NextRequest) {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value

  if (sessionCookie) {
    try {
      await auth.verifySessionCookie(sessionCookie)
      return NextResponse.next()
    } catch {
      // Invalid/expired — fall through to the redirect below.
    }
  }

  return NextResponse.redirect(new URL("/login", request.url))
}

export const config = {
  matcher: [
    "/((?!api/|login|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon-|apple-touch-icon).*)",
  ],
}
