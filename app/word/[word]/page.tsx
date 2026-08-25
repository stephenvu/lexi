import { WordDetail } from "@/components/word-detail";

export default async function WordPage({ params }: PageProps<"/word/[word]">) {
  const { word } = await params;
  const decoded = decodeURIComponent(word);

  return (
    <div className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:pb-24">
      <main className="flex w-full max-w-xl flex-col gap-6">
        {/* key forces a fresh WordDetail (and its loading state) whenever the
            word changes, rather than reusing state across an in-place route
            transition — see components/word-detail.tsx. */}
        <WordDetail key={decoded} word={decoded} />
      </main>
    </div>
  );
}
