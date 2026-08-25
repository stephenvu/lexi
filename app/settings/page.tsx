"use client"

import { useRouter } from "next/navigation"
import { ChevronLeftIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { signOutUser, useAuth } from "@/lib/use-auth"

export default function SettingsPage() {
  const router = useRouter()
  const { user } = useAuth()

  async function handleSignOut() {
    await signOutUser()
    await fetch("/api/session", { method: "DELETE" })
    router.push("/login")
    router.refresh()
  }

  return (
    <div className="flex flex-1 items-start justify-center px-4 py-16 sm:py-24">
      <main className="flex w-full max-w-xl flex-col gap-6">
        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="glass"
            size="icon"
            className="shrink-0 rounded-full"
            onClick={() => router.back()}
            aria-label="Back"
          >
            <ChevronLeftIcon />
          </Button>
          <h1 className="text-[34px] leading-[41px] font-bold tracking-[-0.4px]">Settings</h1>
        </div>

        {user && (
          <div className="glass-surface flex items-center justify-between gap-3 rounded-[26px] p-4">
            <div className="flex min-w-0 items-center gap-3">
              {user.photoURL && (
                // A plain <img>, not next/image — see the identical note in
                // components/header.tsx.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.photoURL}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="size-10 shrink-0 rounded-full"
                />
              )}
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">
                  {user.displayName ?? "Signed in"}
                </span>
                {user.email && (
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                )}
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}
