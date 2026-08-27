import { Suspense } from "react";

import { StudyFlashcards } from "@/components/study-flashcards";

export default function StudyPage() {
  return (
    <div className="flex flex-1 items-start justify-center px-4 pt-6 pb-6">
      <main className="flex w-full max-w-xl flex-col gap-8">
        {/* StudyFlashcards reads useSearchParams() for the optional
            ?deck= param — Next requires a Suspense boundary around any
            component using it under a statically-rendered page (same fix
            already applied to app/page.tsx for DictionarySearch). */}
        <Suspense>
          <StudyFlashcards />
        </Suspense>
      </main>
    </div>
  );
}
