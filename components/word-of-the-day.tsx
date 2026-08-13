"use client"

import { SparklesIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type WordOfTheDayProps = {
  favorites: string[]
  onSelect: (word: string) => void
}

// Local calendar day, not UTC — the rotation should change at the user's
// local midnight, not some server timezone's.
function dayOfYear(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 0)
  return Math.floor((date.getTime() - startOfYear.getTime()) / 86_400_000)
}

/**
 * A featured word drawn from the user's own favorites — deterministic
 * rotation (day-of-year % length), entirely client-side. Click-to-view,
 * not auto-load: matches the rest of the app treating every lookup as an
 * explicit action rather than an automatic one.
 */
export function WordOfTheDay({ favorites, onSelect }: WordOfTheDayProps) {
  const word = favorites.length > 0 ? favorites[dayOfYear(new Date()) % favorites.length] : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <SparklesIcon className="size-4" />
          Word of the day
        </CardTitle>
      </CardHeader>
      <CardContent>
        {word ? (
          <button type="button" onClick={() => onSelect(word)} className="cursor-pointer">
            <Badge className="text-sm">{word}</Badge>
          </button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Favorite a word to see it featured here.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
