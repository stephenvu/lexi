"use client"

import { useCallback, useRef, useState } from "react"

import { getOxfordAudioUrl } from "@/lib/utils"

type SpeakOptions = {
  /** Playback rate multiplier — 1 is normal speed. Applied to both the
   * Oxford audio path and the Web Speech fallback. */
  rate?: number
}

/**
 * Shared pronunciation-audio hook. Used by both the Word page and the
 * flashcard deck. Prefers a real human-recorded pronunciation (Oxford
 * Learner's Dictionaries, via getOxfordAudioUrl's guessed URL) and falls
 * back to the synthetic Web Speech API when that URL doesn't exist for
 * this word (uncommon words, multi-word phrases, inflected forms all
 * 404 — a real, expected path, not a rare edge case).
 *
 * `speak()` returns a promise that resolves once playback finishes (or is
 * cancelled via `stop()`) — the flashcard deck's repeat-playback toggle
 * awaits it to know when it's safe to start the pause before the next
 * repeat. Callers that just want a single play (e.g. components/word-
 * detail.tsx) can ignore the returned promise entirely.
 */
export function useSpeech() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  // The resolver for whichever speak() call is currently in flight, if
  // any — stop() calls this directly so an awaited speak() doesn't hang
  // forever when playback is cancelled rather than left to end naturally.
  const pendingResolveRef = useRef<(() => void) | null>(null)

  const settle = useCallback(() => {
    pendingResolveRef.current?.()
    pendingResolveRef.current = null
  }, [])

  const speakWithBrowserTTS = useCallback(
    (text: string, rate: number | undefined, onDone: () => void) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        setIsSpeaking(false)
        onDone()
        return
      }
      window.speechSynthesis.cancel() // don't let overlapping utterances stack
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = rate ?? 1
      utterance.onstart = () => setIsSpeaking(true)
      utterance.onend = () => {
        setIsSpeaking(false)
        onDone()
      }
      utterance.onerror = () => {
        setIsSpeaking(false)
        onDone()
      }
      window.speechSynthesis.speak(utterance)
    },
    [],
  )

  const speak = useCallback(
    (text: string, options?: SpeakOptions) => {
      return new Promise<void>((resolve) => {
        if (typeof window === "undefined") {
          resolve()
          return
        }

        if (typeof window.speechSynthesis !== "undefined") {
          window.speechSynthesis.cancel()
        }

        pendingResolveRef.current = resolve

        // Lazily create a single reusable <audio> element rather than a new
        // Audio() per call, so overlapping calls cancel/replace cleanly.
        if (!audioRef.current) {
          audioRef.current = new Audio()
        }
        const audio = audioRef.current

        // A failed load fires both the element's error event AND rejects the
        // play() promise — guard so a single Oxford failure only triggers the
        // Web Speech fallback once, not twice.
        let fallbackTriggered = false
        function fallBackToBrowserTTS() {
          if (fallbackTriggered) return
          fallbackTriggered = true
          speakWithBrowserTTS(text, options?.rate, settle)
        }

        audio.onplaying = () => setIsSpeaking(true)
        audio.onended = () => {
          setIsSpeaking(false)
          settle()
        }
        audio.onerror = fallBackToBrowserTTS

        // playbackRate must be set AFTER src/currentTime, not before —
        // assigning `.src` resets playbackRate back to 1 as part of the
        // media element's load algorithm (even when the URL is unchanged,
        // as it usually is here across repeat plays of the same word), so
        // setting it earlier gets silently wiped out.
        audio.src = getOxfordAudioUrl(text)
        audio.currentTime = 0
        audio.playbackRate = options?.rate ?? 1
        audio.play().catch(fallBackToBrowserTTS)
      })
    },
    [speakWithBrowserTTS, settle],
  )

  const stop = useCallback(() => {
    audioRef.current?.pause()
    if (typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined") {
      window.speechSynthesis.cancel()
    }
    setIsSpeaking(false)
    settle()
  }, [settle])

  return { isSpeaking, speak, stop }
}
