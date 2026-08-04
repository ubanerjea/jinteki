import Link from "next/link";

import { SimpleSearchBox } from "@/components/simple-search-box";
import { prisma } from "@/lib/prisma";
import { getPrefixOptions } from "@/lib/search/prefix-options";

export const dynamic = "force-dynamic";

// Homepage: a search box as the primary entry point, then nav.
//
// Started as minimal nav (replacing the create-next-app scaffold) that only
// needed a way to reach /cards and /decklists. Phase 7 made search the
// primary entry point instead (SIMPLE_CARD_SEARCH_PLAN.md, following
// Scryfall's homepage): a plain GET form to /cards sits directly under the
// tagline, "Browse Cards" now opens /cards/advanced, and the Formats list
// and Rules link fill out the rest. Favorites and richer landing-page
// content remain deferred.
export default async function Home() {
  // Formats section (format-descriptions-links-and-search-plan.md §4b):
  // Format is a tiny table (6 rows) - always fetched in full, same treatment
  // /cards/[code]/page.tsx already gives it.
  // getPrefixOptions() feeds the search box's f:/t:/s:/d: type-ahead only -
  // the same lists /cards and /cards/advanced use. It changes nothing about
  // what the form submits or how /cards answers it.
  const [formats, prefixOptions] = await Promise.all([
    prisma.format.findMany({ orderBy: { name: "asc" } }),
    getPrefixOptions(),
  ]);

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
        {/* SIMPLE_CARD_SEARCH_PLAN.md: search sits directly under the
            tagline and above the buttons, because typing a name is the
            common case - the buttons are for when you have nothing specific
            in mind. A plain GET form to the existing /cards route: no new
            route, no new query path, no client component. */}
        <div className="flex w-full flex-col items-center gap-2">
          <form
            method="get"
            action="/cards"
            className="flex h-12 w-full max-w-[470px] items-center gap-2 rounded-full border border-solid border-black/[.08] bg-white pl-5 pr-1.5 dark:border-white/[.145] dark:bg-zinc-900"
          >
            <SimpleSearchBox
              name="q"
              ariaLabel="Search cards"
              placeholder="Search cards"
              options={prefixOptions}
              containerClassName="min-w-0 flex-1"
              className="w-full bg-transparent text-base outline-none"
            />
            <button
              type="submit"
              className="flex h-9 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Search
            </button>
          </form>
          <p className="text-sm text-zinc-500">
            Try <code>bioroid</code>, or <code>f:anarch virus</code> ·{" "}
            <Link href="/cards/syntax" className="underline">
              Search syntax help
            </Link>
          </p>
        </div>

        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <Link
            // Repointed in Phase 7: this button means "go filter and browse",
            // which is the advanced form's job. The site header's Cards link
            // deliberately still goes to the simple page.
            href="/cards/advanced"
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
        <p className="-mt-4 text-sm text-zinc-500">
          Browse Cards opens the advanced search form.
        </p>

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
