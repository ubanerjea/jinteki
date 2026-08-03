import Link from "next/link";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Minimal homepage nav (replaces the default create-next-app scaffold page).
// Rules-glossary browsing, favorites, and any richer landing-page content
// are Phase 5+ per PHASE_4_PLAN.md's "Explicitly deferred" list - this phase
// only needs a way to get to /cards and /decklists.
export default async function Home() {
  // Formats section (format-descriptions-links-and-search-plan.md §4b):
  // Format is a tiny table (6 rows) - always fetched in full, same treatment
  // /cards/[code]/page.tsx already gives it.
  const formats = await prisma.format.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col items-center gap-8 px-8 py-24 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-black dark:text-zinc-50">
          jinteki
        </h1>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          Browse and search Android: Netrunner cards and NetrunnerDB
          decklists.
        </p>
        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <Link
            href="/cards"
            className="flex h-12 w-40 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Browse Cards
          </Link>
          <Link
            href="/decklists"
            className="flex h-12 w-40 items-center justify-center rounded-full border border-solid border-black/[.08] transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            Browse Decklists
          </Link>
          <Link
            href="/rules"
            className="flex h-12 w-40 items-center justify-center rounded-full border border-solid border-black/[.08] transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            Browse Rules
          </Link>
        </div>

        <div className="flex flex-col items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Formats
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-3 text-sm font-medium">
            {formats.map((format) => (
              <Link
                key={format.id}
                href={`/formats/${format.id}`}
                className="underline decoration-dotted hover:decoration-solid"
              >
                {format.name}
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
