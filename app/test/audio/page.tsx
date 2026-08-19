"use client"

import { useRef, useState } from "react"
import { Volume2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Status = "idle" | "playing" | "error"

// Scratch debug tool — not part of the app's real nav (no TabBar entry),
// just for manually testing whether a given MP3 URL actually plays.
export default function AudioTestPage() {
  const [url, setUrl] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  function handlePlay() {
    const trimmed = url.trim()
    if (!trimmed || !audioRef.current) return

    setErrorMessage(null)
    const audio = audioRef.current
    if (audio.src !== trimmed) {
      audio.src = trimmed
    }
    audio.currentTime = 0
    audio.play().catch((error) => {
      setStatus("error")
      setErrorMessage((error as Error).message)
    })
  }

  return (
    <div className="flex flex-1 items-start justify-center px-4 py-16 sm:py-24">
      <main className="flex w-full max-w-xl flex-col gap-4">
        <h1 className="text-2xl font-bold">MP3 URL test</h1>
        <p className="text-sm text-muted-foreground">
          Paste an MP3 URL and click the speaker to test playback.
        </p>

        <div className="flex items-center gap-2">
          <Input
            type="url"
            placeholder="https://example.com/sound.mp3"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <Button
            type="button"
            size="icon"
            onClick={handlePlay}
            disabled={!url.trim()}
            aria-label="Play MP3"
          >
            <Volume2Icon />
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Status: {status}
          {status === "error" && errorMessage ? ` — ${errorMessage}` : ""}
        </p>

        <audio
          ref={audioRef}
          onPlaying={() => setStatus("playing")}
          onEnded={() => setStatus("idle")}
          onError={() => {
            setStatus("error")
            setErrorMessage("Failed to load or play this URL.")
          }}
          className="hidden"
        />
      </main>
    </div>
  )
}
