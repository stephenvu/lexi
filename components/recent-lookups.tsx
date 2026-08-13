"use client"

import { StarIcon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"

type RecentLookupsProps = {
  favorites: string[]
  history: string[]
  onSelect: (word: string) => void
  onRemoveFavorite: (word: string) => void
  onRemoveHistory: (word: string) => void
}

/** A slim chip strip: favorites first, then recent history (deduped against
 * favorites so a saved word doesn't show up twice). Renders nothing when
 * both lists are empty. */
export function RecentLookups({
  favorites,
  history,
  onSelect,
  onRemoveFavorite,
  onRemoveHistory,
}: RecentLookupsProps) {
  const recentOnly = history.filter((word) => !favorites.includes(word))

  if (favorites.length === 0 && recentOnly.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {favorites.map((word) => (
        <Chip key={`fav-${word}`} word={word} favorite onSelect={onSelect} onRemove={onRemoveFavorite} />
      ))}
      {recentOnly.map((word) => (
        <Chip key={`hist-${word}`} word={word} onSelect={onSelect} onRemove={onRemoveHistory} />
      ))}
    </div>
  )
}

function Chip({
  word,
  favorite,
  onSelect,
  onRemove,
}: {
  word: string
  favorite?: boolean
  onSelect: (word: string) => void
  onRemove: (word: string) => void
}) {
  return (
    <Badge variant={favorite ? "default" : "outline"} className="gap-1 pr-1">
      <button type="button" onClick={() => onSelect(word)} className="flex items-center gap-1">
        {favorite && <StarIcon className="size-3" fill="currentColor" />}
        {word}
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onRemove(word)
        }}
        aria-label={`Remove ${word}`}
        className="opacity-70 hover:opacity-100"
      >
        <XIcon className="size-3" />
      </button>
    </Badge>
  )
}
