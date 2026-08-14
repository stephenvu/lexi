"use client"

import { useRef, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { BookOpenIcon, GraduationCapIcon, SearchIcon, StarIcon, Volume2Icon } from "lucide-react"

import { RecentLookups } from "@/components/recent-lookups"
import { WordOfTheDay } from "@/components/word-of-the-day"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Field, FieldGroup } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import type { DefinitionResult } from "@/lib/gemini"
import { usePersistedList } from "@/lib/use-persisted-list"

const HISTORY_CAP = 20

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

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: DefinitionResult }
  | { status: "not-found"; message: string | null; suggestion: string | null }
  | { status: "error"; message: string }

export function DictionarySearch() {
  const [word, setWord] = useState("")
  const [state, setState] = useState<State>({ status: "idle" })
  const abortRef = useRef<AbortController | null>(null)

  const canSpeak = useSyncExternalStore(subscribeToNothing, getSpeechSupport, getServerSpeechSupport)
  const [isSpeaking, setIsSpeaking] = useState(false)

  const history = usePersistedList("lexi.history", { cap: HISTORY_CAP })
  const favorites = usePersistedList("lexi.favorites")

  function speak(text: string) {
    if (!canSpeak) return
    window.speechSynthesis.cancel() // don't let overlapping utterances stack
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    window.speechSynthesis.speak(utterance)
  }

  async function runSearch(rawWord: string) {
    const trimmed = rawWord.trim()
    if (!trimmed) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setState({ status: "loading" })

    try {
      const response = await fetch(`/api/define?word=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
      const body = await response.json()

      if (body.status !== "ok") {
        setState({ status: "error", message: body.message ?? "Something went wrong." })
        return
      }

      const data = body.data as DefinitionResult
      if (!data.found) {
        setState({ status: "not-found", message: data.message, suggestion: data.suggestion })
        return
      }

      history.add(data.word)
      setState({ status: "success", data })
    } catch (error) {
      if ((error as Error).name === "AbortError") return
      setState({ status: "error", message: "Something went wrong. Please try again." })
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    runSearch(word)
  }

  // Shared by synonym/antonym chips and the "did you mean" suggestion —
  // updates the search box to match, then re-runs the same lookup path.
  function handleChipClick(chipWord: string) {
    setWord(chipWord)
    runSearch(chipWord)
  }

  const isLoading = state.status === "loading"

  return (
    <div className="flex w-full flex-col gap-6">
      <WordOfTheDay favorites={favorites.items} onSelect={handleChipClick} />

      <Button
        variant="link"
        size="sm"
        className="self-center"
        render={<Link href="/study" />}
        nativeButton={false}
      >
        <GraduationCapIcon data-icon="inline-start" />
        Study your favorites
      </Button>

      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <InputGroup>
              <InputGroupInput
                name="word"
                placeholder="Look up a word…"
                autoComplete="off"
                disabled={isLoading}
                value={word}
                onChange={(event) => setWord(event.target.value)}
              />
              <InputGroupAddon align="inline-end">
                <Button type="submit" size="sm" disabled={isLoading}>
                  {isLoading ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <SearchIcon data-icon="inline-start" />
                  )}
                  Search
                </Button>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </FieldGroup>
      </form>

      <RecentLookups
        favorites={favorites.items}
        history={history.items}
        onSelect={handleChipClick}
        onRemoveFavorite={favorites.remove}
        onRemoveHistory={history.remove}
      />

      {state.status === "loading" && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      )}

      {state.status === "success" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              {state.data.word}
              {state.data.cefrLevel && <Badge variant="outline">{state.data.cefrLevel}</Badge>}
            </CardTitle>
            <CardAction>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() =>
                  favorites.has(state.data.word)
                    ? favorites.remove(state.data.word)
                    : favorites.add(state.data.word)
                }
                aria-label={
                  favorites.has(state.data.word)
                    ? `Remove ${state.data.word} from favorites`
                    : `Save ${state.data.word} to favorites`
                }
              >
                <StarIcon fill={favorites.has(state.data.word) ? "currentColor" : "none"} />
              </Button>
            </CardAction>
            {state.data.ipa && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <span className="font-mono text-sm">{state.data.ipa}</span>
                {canSpeak && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => speak(state.data.word)}
                    aria-label={`Play pronunciation of ${state.data.word}`}
                  >
                    {isSpeaking ? <Spinner /> : <Volume2Icon />}
                  </Button>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {state.data.entries.map((entry, index) => (
              <div key={index} className="flex flex-col gap-1">
                <Badge variant="secondary">{entry.partOfSpeech}</Badge>
                <p>{entry.definition}</p>
                {entry.translatedDefinition && (
                  <p className="text-sm text-muted-foreground">
                    {entry.translatedWord
                      ? `${entry.translatedWord} — ${entry.translatedDefinition}`
                      : entry.translatedDefinition}
                  </p>
                )}
                <p className="text-sm text-muted-foreground italic">
                  &ldquo;{entry.example}&rdquo;
                </p>
                {entry.usageNote && (
                  <p className="text-sm text-muted-foreground">{entry.usageNote}</p>
                )}
                {entry.synonyms.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Synonyms:</span>
                    {entry.synonyms.map((synonym) => (
                      <button key={synonym} type="button" onClick={() => handleChipClick(synonym)}>
                        <Badge variant="outline">{synonym}</Badge>
                      </button>
                    ))}
                  </div>
                )}
                {entry.antonyms.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Antonyms:</span>
                    {entry.antonyms.map((antonym) => (
                      <button key={antonym} type="button" onClick={() => handleChipClick(antonym)}>
                        <Badge variant="outline">{antonym}</Badge>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {state.status === "not-found" && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpenIcon />
            </EmptyMedia>
            <EmptyTitle>No definition found</EmptyTitle>
            <EmptyDescription>
              {state.message ?? "That doesn't look like a word we can define."}
            </EmptyDescription>
          </EmptyHeader>
          {state.suggestion && (
            <EmptyContent>
              <Button type="button" variant="outline" size="sm" onClick={() => handleChipClick(state.suggestion!)}>
                Did you mean &ldquo;{state.suggestion}&rdquo;?
              </Button>
            </EmptyContent>
          )}
        </Empty>
      )}

      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Lookup failed</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
