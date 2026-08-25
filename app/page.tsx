import { DictionarySearch } from "@/components/dictionary-search";
import { ProfileButton } from "@/components/profile-button";

export default function Home() {
  return (
    <div className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:pb-24">
      <main className="flex w-full max-w-xl flex-col gap-6">
        <div className="flex items-center justify-between gap-2.5">
          <h1 className="text-[34px] leading-[41px] font-bold tracking-[-0.4px]">
            Home
          </h1>
          <ProfileButton />
        </div>
        <DictionarySearch />
      </main>
    </div>
  );
}
