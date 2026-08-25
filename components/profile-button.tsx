"use client"

import Link from "next/link"
import { UserIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/use-auth"

/** Inline avatar button, rendered next to the title on Home only — the
 * one way into /settings, which isn't one of TabBar's 3 tabs. Same
 * glass-circle/`render`-as-link convention as other icon buttons (e.g.
 * the back button on components/word-detail.tsx). */
export function ProfileButton() {
  const { user } = useAuth()

  return (
    <Button
      render={<Link href="/settings" />}
      nativeButton={false}
      variant="glass"
      size="icon"
      className="shrink-0 overflow-hidden rounded-full text-muted-foreground"
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
  )
}
