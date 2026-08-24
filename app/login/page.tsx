"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { migrateLocalDataToCloud } from "@/lib/migrate-local-data"
import { signInWithGoogle } from "@/lib/use-auth"

// No mockup exists for this screen — a simple centered glass card matching
// the app's established aesthetic. The one page middleware.ts never gates.
export default function LoginPage() {
  const router = useRouter()
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignIn() {
    setIsSigningIn(true)
    setError(null)

    try {
      const idToken = await signInWithGoogle()

      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      })
      if (!response.ok) {
        throw new Error("Failed to start session")
      }

      // Only does real work on a genuine first sign-in for this account —
      // see lib/migrate-local-data.ts.
      await migrateLocalDataToCloud()

      router.push("/")
      router.refresh()
    } catch (err) {
      console.error("Sign-in failed:", err)
      setError("Sign-in failed. Please try again.")
      setIsSigningIn(false)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-6 py-4 text-center">
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-2xl font-bold">Welcome to Lexi</h1>
            <p className="text-sm text-muted-foreground">
              Sign in to sync your saved words and study progress across devices.
            </p>
          </div>
          <Button type="button" className="w-full" disabled={isSigningIn} onClick={handleSignIn}>
            {isSigningIn && <Spinner data-icon="inline-start" />}
            Sign in with Google
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
