"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { GraduationCapIcon, HouseIcon, LibraryIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const TABS = [
  { href: "/", label: "Home", icon: HouseIcon },
  { href: "/study", label: "Study", icon: GraduationCapIcon },
  { href: "/library", label: "Library", icon: LibraryIcon },
] as const

/** Persistent bottom glass tab bar, rendered once from the root layout so
 * it survives navigation between pages. */
export function TabBar() {
  const pathname = usePathname()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-3">
      <div className="glass-tabbar grid w-full max-w-sm grid-cols-3 gap-1 rounded-[30px] p-1.5">
        {TABS.map(({ href, label, icon: Icon }) => {
          // /word/[word] is a pushed detail screen, not a tab of its own —
          // the mockup always shows Home highlighted while on it, regardless
          // of whether the page was reached from Home, Library, or a chip.
          const isActive =
            pathname === href || (href === "/" && pathname.startsWith("/word"))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-3xl text-[11px] tracking-tight",
                isActive ? "bg-primary/14 font-semibold text-primary" : "font-medium text-muted-foreground"
              )}
            >
              <Icon className="size-[23px]" />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
