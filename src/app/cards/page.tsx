import Link from "next/link";

import { CardResultsList, parseView } from "@/components/card-results";
import { PaginationNav } from "@/components/pagination-nav";
import { ResultsControls } from "@/components/results-controls";
import { parseCardSearchParams, searchCards } from "@/lib/search/cards";
import {
  clearFacetsHref,
  describeFacets,
  editInAdvancedHref,
  FACET_PARAMS,
  formatFacetSummary,
} from "@/lib/search/filter-summary";
import { allParams, type SearchParamsInput } from "@/lib/search/types";

export const dynamic = "force-dynamic";

// Simple card search (PHASE_7_PLAN.md item 8, SIMPLE_CARD_SEARCH_PLAN.md).
//
// One free-text box, nothing else. The Faction / Side / Type / Keyword /
// Pack / Format / Sort <select>s that used to wrap onto a single line here
// **moved** to /cards/advanced - and so did the four queries that populated
// them (prisma.faction.findMany, the keyword groupBy, prisma.pack.findMany,
// prisma.format.findMany). They are not left running here.
//
// **parseCardSearchParams() is deliberately unchanged.** It still reads
// every facet param, so bookmarked links, facet links elsewhere in the app,
// and anything else pointing at /cards?faction=... keeps filtering exactly
// as before. This page simply no longer offers a widget to change them -
// hence the read-only "filtered by" note below.
//
// Next.js App Router passes `searchParams` as a Promise. URL searchParams
// remain the entire source of truth for list/filter state on this page - no
// client component, no local state, per PHASE_4_PLAN.md.
export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  const rawParams = await searchParams;
  const params = parseCardSearchParams(rawParams);
  const view = parseView(rawParams);

  const { items, total, page, pageSize, totalPages } = await searchCards(params);

  // Read-only "filtered by" note. Built from the *parsed* params, so an
  // `f:anarch` token typed into the box is reported as the faction filter it
  // actually became. Costs no query - it reads values already in hand.
  const activeFacets = describeFacets({
    faction: params.faction,
    side: params.side,
    type: params.type,
    keyword: params.keyword,
    pack: params.pack,
    format: params.format,
  });

  // Presentation and inbound-filter state ride along in hidden inputs, so
  // re-searching doesn't silently reset the view/sort/page size or drop a
  // filter the user arrived with. "Clear filter" below is the way to drop
  // one; the search button is not.
  const carriedParams: { name: string; value: string }[] = [
    { name: "view", value: view },
    ...(params.order ? [{ name: "order", value: params.order }] : []),
    ...(rawParams.pageSize !== undefined
      ? [{ name: "pageSize", value: String(pageSize) }]
      : []),
    ...FACET_PARAMS.flatMap(({ key }) =>
      allParams(rawParams, key).map((value) => ({ name: key, value })),
    ),
  ];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Cards</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/cards/advanced" className="underline">
            Advanced search
          </Link>
          <Link href="/cards/random" className="underline">
            Random card
          </Link>
          <Link href="/" className="underline">
            Home
          </Link>
        </div>
      </div>

      <form method="get" className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="e.g. Sure Gamble"
            aria-label="Search cards"
            className="min-w-0 flex-1 rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            className="rounded bg-foreground px-4 py-1.5 text-sm font-medium text-background"
          >
            Search
          </button>
        </div>
        {carriedParams.map(({ name, value }) => (
          <input key={`${name}-${value}`} type="hidden" name={name} value={value} />
        ))}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Searches card names and rules text together.{" "}
          <Link href="/cards/syntax" className="underline">
            Search syntax help
          </Link>
          .
        </p>
      </form>

      {activeFacets.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-zinc-600 dark:text-zinc-400">
            {/* ": " per SIMPLE_CARD_SEARCH_PLAN.md's "Filtered by
                **Faction: Anarch**". The advanced results summary keeps the
                colon-less form its own doc specifies. */}
            Filtered by <strong>{formatFacetSummary(activeFacets, ": ")}</strong> — set
            from the link you followed, and not editable here.
          </span>
          <Link href={clearFacetsHref("/cards", rawParams)} className="underline">
            Clear filter
          </Link>
          <Link href={editInAdvancedHref(rawParams)} className="underline">
            Edit in advanced search
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {total} card{total === 1 ? "" : "s"} found
        </p>
        <ResultsControls
          basePath="/cards"
          searchParams={rawParams}
          view={view}
          order={params.order ?? ""}
          pageSize={pageSize}
        />
      </div>

      <CardResultsList items={items} view={view} />

      <PaginationNav
        basePath="/cards"
        searchParams={rawParams}
        page={page}
        totalPages={totalPages}
      />
    </main>
  );
}
