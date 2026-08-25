"use client"

import { useRouter } from "next/navigation"
import { ChevronLeftIcon } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { SUPPORTED_LANGUAGES } from "@/lib/languages"
import { signOutUser, useAuth } from "@/lib/use-auth"
import { useTargetLanguage } from "@/lib/use-target-language"

// Base UI's Select needs an explicit items array (unlike Radix's inline-JSX
// SelectItem children) — see .agents/skills/shadcn/rules/base-vs-radix.md.
const LANGUAGE_ITEMS = SUPPORTED_LANGUAGES.map(({ code, label }) => ({
  value: code,
  label,
}))

export default function SettingsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { targetLanguage, setTargetLanguage } = useTargetLanguage()

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

        <div className="glass-surface flex items-center justify-between gap-3 rounded-[26px] p-4">
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-semibold">Translate to</span>
            <span className="truncate text-xs text-muted-foreground">
              Shown alongside each definition. English means no translation.
            </span>
          </div>
          <Select
            items={LANGUAGE_ITEMS}
            value={targetLanguage}
            onValueChange={(value) => value && setTargetLanguage(value)}
          >
            <SelectTrigger className="shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {LANGUAGE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
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
