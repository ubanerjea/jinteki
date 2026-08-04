import Link from "next/link";

import { CardResultsList, parseView } from "@/components/card-results";
import { PaginationNav } from "@/components/pagination-nav";
import { ResultsControls } from "@/components/results-controls";
import {
  parseAdvancedCardSearchParams,
  searchCardsAdvanced,
} from "@/lib/search/cards-advanced";
import { describeFacets, formatFacetSummary } from "@/lib/search/filter-summary";
import type { SearchParamsInput } from "@/lib/search/types";

export const dynamic = "force-dynamic";

// Results for the advanced form (PHASE_7_PLAN.md item 6). Display / sort /
// page-size controls only - **no filter widgets**. Changing a filter means
// going back to /cards/advanced via "Edit search", which restores every
// value from this URL.

// Rebuilds the form's URL from this page's params, so "Edit search" reopens
// the form with exactly what produced these results.
function editSearchHref(input: SearchParamsInput): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || key === "page") continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `/cards/advanced?${qs}` : "/cards/advanced";
}

export default async function AdvancedCardResultsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  const rawParams = await searchParams;
  const params = parseAdvancedCardSearchParams(rawParams);
  const view = parseView(rawParams);

  const { items, total, page, pageSize, totalPages } =
    await searchCardsAdvanced(params);

  // Read-only summary of the active query. Required, not decorative: with
  // the filters living on another route this is the only thing on the page
  // that can explain its own result count. Built from the *parsed* params,
  // so it reports exactly what filtered the results - including the fact
  // that Card Name is now literal text: `?title=f:anarch` reads back as
  // Name “f:anarch”, not as a Faction filter, because that is what it is.
  const summaryParts: string[] = [];
  if (params.title) summaryParts.push(`Name “${params.title}”`);
  if (params.text) summaryParts.push(`Text “${params.text}”`);
  const facets = formatFacetSummary(
    describeFacets({
      faction: params.faction,
      side: params.side,
      type: params.type,
      keyword: params.keyword,
      pack: params.pack,
      format: params.format,
    }),
  );
  if (facets) summaryParts.push(facets);
  if (params.fuzzy) summaryParts.push("Fuzzy matching on");

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Search results</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link href={editSearchHref(rawParams)} className="underline">
            Edit search
          </Link>
          <Link href="/" className="underline">
            Home
          </Link>
        </div>
      </div>

      <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        {summaryParts.length > 0 ? (
          summaryParts.join(" · ")
        ) : (
          <>
            No criteria — showing every card.{" "}
            <Link href="/cards/advanced" className="underline">
              Add some
            </Link>
            .
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {total} card{total === 1 ? "" : "s"} found
        </p>
        <ResultsControls
          basePath="/cards/advanced/results"
          searchParams={rawParams}
          view={view}
          order={params.order ?? ""}
          pageSize={pageSize}
        />
      </div>

      <CardResultsList items={items} view={view} />

      <PaginationNav
        basePath="/cards/advanced/results"
        searchParams={rawParams}
        page={page}
        totalPages={totalPages}
      />
    </main>
  );
}
