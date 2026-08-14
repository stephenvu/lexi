import { LibraryIcon } from "lucide-react"

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

export default function LibraryPage() {
  return (
    <div className="flex flex-1 items-start justify-center px-4 py-16 sm:py-24">
      <main className="flex w-full max-w-xl flex-col gap-8">
        <h1 className="text-[34px] leading-[41px] font-bold tracking-[-0.4px]">Library</h1>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LibraryIcon />
            </EmptyMedia>
            <EmptyTitle>Coming soon</EmptyTitle>
            <EmptyDescription>
              A place to browse everything you&rsquo;ve looked up is on the way.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    </div>
  )
}
