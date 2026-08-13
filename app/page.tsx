import { DictionarySearch } from "@/components/dictionary-search"

export default function Home() {
  return (
    <div className="flex flex-1 items-start justify-center bg-background px-4 py-16 sm:py-24">
      <main className="flex w-full max-w-xl flex-col gap-8">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Lexi</h1>
          <p className="text-muted-foreground">
            An AI-generated dictionary. Look up any word to get its definition.
          </p>
        </div>
        <DictionarySearch />
      </main>
    </div>
  )
}
