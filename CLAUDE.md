# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm run dev` — start the dev server (Turbopack, via `next dev`)
- `npm run build` — production build
- `npm run start` — run a production build
- `npm run lint` — ESLint (flat config, `eslint-config-next` core-web-vitals + typescript rules)

There is no test runner configured in this repo — don't assume Jest/Vitest/Playwright exist unless you add and wire one up yourself.

## Architecture

This is a freshly bootstrapped Next.js App Router project (`app/` directory, currently just a root layout and a single home page) styled with Tailwind CSS v4 and shadcn/ui.

**Next.js version is non-standard.** See `AGENTS.md` (imported above) — this is not the Next.js version in your training data. Check `node_modules/next/dist/docs/` for the real API before using App Router conventions you already "know" (routing, layouts, metadata, etc.).

### UI component system (shadcn/ui)

- `components.json` drives everything: style `base-maia`, base color `mist`, Tailwind CSS v4 (`cssVariables: true`), icon library `lucide`. Path aliases: `@/components`, `@/components/ui`, `@/lib`, `@/hooks` (all resolve via the single `@/*` tsconfig path).
- **Primitive library is Base UI (`@base-ui/react`), not Radix.** Existing shadcn/Radix knowledge for prop APIs (`asChild` vs `render`, event handling, etc.) doesn't directly transfer — check `.agents/skills/shadcn/rules/base-vs-radix.md` before assuming an API.
- Theme tokens (colors, radius, sidebar/chart colors) are CSS variables defined in `app/globals.css` under `:root` / `.dark`, remapped into Tailwind via the `@theme inline` block. `--radius` is the single source for all corner-radius scale steps (`--radius-sm` … `--radius-4xl` are derived from it). Edit `app/globals.css` for any theme/token change — never hand-roll a second config file.
- Only `components/ui/button.tsx` exists so far. Use the shadcn CLI (`npx shadcn@latest add <component>`) to add more rather than hand-writing primitives; the project's shadcn skill (`.agents/skills/shadcn/`) has the full ruleset (forms use `FieldGroup`/`Field`, semantic color tokens only, `gap-*` not `space-y-*`, icons via `data-icon`, etc.) — follow it for any UI work.
- `lib/utils.ts` exports `cn()` (`clsx` + `tailwind-merge`) — the standard way to compose/override Tailwind classes across this codebase.

### Fonts

`app/layout.tsx` loads four `next/font/google` fonts (Geist, Geist Mono, Figtree as `--font-sans`, Outfit as `--font-heading`) and applies them as CSS variables on `<html>` via `cn()`. `globals.css` maps `--font-sans`/`--font-mono`/`--font-heading` into Tailwind's theme, so use the `font-sans`/`font-mono`/`font-heading` utility classes rather than referencing font variables directly.
