"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";

import { RecentLookups } from "@/components/recent-lookups";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { usePersistedList } from "@/lib/use-persisted-list";

const HISTORY_CAP = 20;

// Home is just the entry point now — submitting a search or picking a
// recent lookup both push to /word/<word>, which owns the actual lookup
// and every one of its states (loading, found, not-found). See
// components/word-detail.tsx.
export function DictionarySearch() {
  const router = useRouter();
  const [word, setWord] = useState("");
  const history = usePersistedList("history", { cap: HISTORY_CAP });

  function goToWord(rawWord: string) {
    const trimmed = rawWord.trim();
    if (!trimmed) return;
    router.push(`/word/${encodeURIComponent(trimmed)}`);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    goToWord(word);
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Word of the day hidden for now — component/file untouched, just not rendered. */}

      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <InputGroup>
              <InputGroupInput
                name="word"
                placeholder="Look up a word…"
                autoComplete="off"
                value={word}
                onChange={(event) => setWord(event.target.value)}
              />
              <InputGroupAddon align="inline-end">
                <Button type="submit" size="sm">
                  <SearchIcon data-icon="inline-start" />
                  Search
                </Button>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </FieldGroup>
      </form>

      <RecentLookups
        history={history.items}
        onSelect={goToWord}
        onRemove={history.remove}
      />
    </div>
  );
}
