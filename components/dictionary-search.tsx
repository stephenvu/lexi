"use client"

import { useRef, useState } from "react"
import { BookOpenIcon, SearchIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Empty,
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

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: DefinitionResult }
  | { status: "not-found"; message: string | null }
  | { status: "error"; message: string }

export function DictionarySearch() {
  const [state, setState] = useState<State>({ status: "idle" })
  const abortRef = useRef<AbortController | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const word = String(formData.get("word") ?? "").trim()
    if (!word) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setState({ status: "loading" })

    try {
      const response = await fetch(`/api/define?word=${encodeURIComponent(word)}`, {
        signal: controller.signal,
      })
      const body = await response.json()

      if (body.status !== "ok") {
        setState({ status: "error", message: body.message ?? "Something went wrong." })
        return
      }

      const data = body.data as DefinitionResult
      if (!data.found) {
        setState({ status: "not-found", message: data.message })
        return
      }

      setState({ status: "success", data })
    } catch (error) {
      if ((error as Error).name === "AbortError") return
      setState({ status: "error", message: "Something went wrong. Please try again." })
    }
  }

  const isLoading = state.status === "loading"

  return (
    <div className="flex w-full flex-col gap-6">
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <InputGroup>
              <InputGroupInput
                name="word"
                placeholder="Look up a word…"
                autoComplete="off"
                disabled={isLoading}
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
            <CardTitle className="text-2xl">{state.data.word}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {state.data.entries.map((entry, index) => (
              <div key={index} className="flex flex-col gap-1">
                <Badge variant="secondary">{entry.partOfSpeech}</Badge>
                <p>{entry.definition}</p>
                <p className="text-sm text-muted-foreground italic">
                  &ldquo;{entry.example}&rdquo;
                </p>
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
