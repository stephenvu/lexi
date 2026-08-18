"use client"

import { useState, useSyncExternalStore } from "react"

// Browser speech-synthesis support never changes after mount but isn't
// knowable during SSR — useSyncExternalStore gives a hydration-safe way to
// read it (server snapshot = false, matching the SSR pass) without the
// extra-render anti-pattern of setState-in-an-effect.
function subscribeToNothing() {
  return () => {}
}
function getSpeechSupport() {
  return typeof window !== "undefined" && "speechSynthesis" in window
}
function getServerSpeechSupport() {
  return false
}

/**
 * Shared pronunciation-audio hook (Web Speech API). Used by both the search
 * result card and the flashcard deck, so the feature-detection + imperative
 * speak() call lives here once instead of being duplicated per component.
 */
export function useSpeech() {
  const canSpeak = useSyncExternalStore(
    subscribeToNothing,
    getSpeechSupport,
    getServerSpeechSupport
  )
  const [isSpeaking, setIsSpeaking] = useState(false)

  function speak(text: string) {
    if (!canSpeak) return
    window.speechSynthesis.cancel() // don't let overlapping utterances stack
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    window.speechSynthesis.speak(utterance)
  }

  return { canSpeak, isSpeaking, speak }
}
