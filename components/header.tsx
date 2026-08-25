"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { UserIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/use-auth"

/** Persistent top-right avatar, rendered once from the root layout so it
 * survives navigation between pages — the one way into /settings, which
 * isn't one of TabBar's 3 tabs. Same floating-glass/hide-on-/login
 * conventions as components/tab-bar.tsx. */
export function Header() {
  const pathname = usePathname()
  const { user } = useAuth()

  if (pathname === "/login") return null

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-end px-4 pt-16 sm:pt-24">
      <Button
        render={<Link href="/settings" />}
        nativeButton={false}
        variant="glass"
        size="icon"
        className="overflow-hidden rounded-full text-muted-foreground"
        aria-label="Settings"
      >
        {user?.photoURL ? (
          // A plain <img>, not next/image — this is one of only two
          // external-domain images in the app (the other is the same
          // Google photo on the Settings page), and configuring
          // remotePatterns for an avatar isn't worth the extra config.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photoURL}
            alt=""
            referrerPolicy="no-referrer"
            className="size-full object-cover"
          />
        ) : (
          <UserIcon />
        )}
      </Button>
    </header>
  )
}
