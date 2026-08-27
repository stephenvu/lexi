"use client"

import { XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"

type RecentLookupsProps = {
  history: string[]
  onSelect: (word: string) => void
  onRemove: (word: string) => void
}

const MAX_ITEMS = 6

/** A slim, single-line chip strip of recent lookups — horizontally
 * scrollable if it overflows, with the scrollbar itself hidden (reads
 * better on mobile), capped to the most recent 6. Saved words show up
 * here too (every lookup is logged to history, saved or not) with no
 * special styling — this strip doesn't distinguish them. Renders nothing
 * when history is empty. */
export function RecentLookups({ history, onSelect, onRemove }: RecentLookupsProps) {
  if (history.length === 0) {
    return null
  }

  const items = history.slice(0, MAX_ITEMS)

  return (
    <div className="scrollbar-hide flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1">
      {items.map((word) => (
        <Chip key={word} word={word} onSelect={onSelect} onRemove={onRemove} />
      ))}
    </div>
  )
}

function Chip({
  word,
  onSelect,
  onRemove,
}: {
  word: string
  onSelect: (word: string) => void
  onRemove: (word: string) => void
}) {
  return (
    <Badge
      variant="ghost"
      className="glass-chip text-foreground shrink-0 h-9 gap-1.5 rounded-full px-3.5 py-1.5 pr-2 text-sm"
    >
      <button type="button" onClick={() => onSelect(word)} className="flex items-center gap-1.5">
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
        <XIcon className="size-4" />
      </button>
    </Badge>
  )
}
