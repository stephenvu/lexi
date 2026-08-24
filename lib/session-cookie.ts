// Just the cookie name, shared between app/api/session/route.ts and
// middleware.ts — kept in its own dependency-free module rather than
// exported from route.ts, since middleware.ts runs in the Edge runtime and
// can't pull in anything that transitively imports firebase-admin (a
// Node.js-only SDK) the way route.ts does.
export const SESSION_COOKIE_NAME = "__session"
