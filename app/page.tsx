import { Suspense } from "react"
import { DictionarySearch } from "@/components/dictionary-search"

export default function Home() {
  return (
    <div className="flex flex-1 items-start justify-center px-4 py-16 sm:py-24">
      <main className="flex w-full max-w-xl flex-col gap-6">
        <h1 className="text-[34px] leading-[41px] font-bold tracking-[-0.4px]">Home</h1>
        {/* DictionarySearch reads useSearchParams() for Library's tap-through
            deep link (`/?word=`) — Next requires a Suspense boundary around
            any component using it under a statically-rendered page. No
            fallback needed: the search params resolve on the client almost
            immediately, well before there's anything worth showing instead. */}
        <Suspense>
          <DictionarySearch />
        </Suspense>
      </main>
    </div>
  )
}
