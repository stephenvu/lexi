"use client"

import { useCallback, useRef, useState } from "react"

import { getOxfordAudioUrl } from "@/lib/utils"

/**
 * Shared pronunciation-audio hook. Used by both the Word page and the
 * flashcard deck. Prefers a real human-recorded pronunciation (Oxford
 * Learner's Dictionaries, via getOxfordAudioUrl's guessed URL) and falls
 * back to the synthetic Web Speech API when that URL doesn't exist for
 * this word (uncommon words, multi-word phrases, inflected forms all
 * 404 — a real, expected path, not a rare edge case).
 */
export function useSpeech() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)

  const speakWithBrowserTTS = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setIsSpeaking(false)
      return
    }
    window.speechSynthesis.cancel() // don't let overlapping utterances stack
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    window.speechSynthesis.speak(utterance)
  }, [])

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined") return

      if (typeof window.speechSynthesis !== "undefined") {
        window.speechSynthesis.cancel()
      }

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
        speakWithBrowserTTS(text)
      }

      audio.onplaying = () => setIsSpeaking(true)
      audio.onended = () => setIsSpeaking(false)
      audio.onerror = fallBackToBrowserTTS

      audio.src = getOxfordAudioUrl(text)
      audio.currentTime = 0
      audio.play().catch(fallBackToBrowserTTS)
    },
    [speakWithBrowserTTS],
  )

  return { isSpeaking, speak }
}
