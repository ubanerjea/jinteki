import Link from "next/link";

import { PaginationNav } from "@/components/pagination-nav";
import { formatCode } from "@/lib/format";
import {
  parseAdvancedDecklistSearchParams,
  searchDecklistsAdvanced,
} from "@/lib/search/decklists-advanced";
import { PAGE_SIZE_OPTIONS } from "@/lib/search/pagination";
import type { SearchParamsInput } from "@/lib/search/types";

export const dynamic = "force-dynamic";

// Results for the advanced decklist form (PHASE_8_PLAN.md item 5). No
// "Display" group (list/grid is a card-image concept that doesn't apply to
// decklists) - just result count, then Sort (Name/Date) + Per page, rendered
// as plain links (same reasoning as ResultsControls: no <form> around this
// page, so a <select> with no submit button needs client JS to do anything).

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
  return qs ? `/decklists/advanced?${qs}` : "/decklists/advanced";
}

// Same override-preserving href builder as hrefWithOverrides()
// (src/components/card-results.tsx) - not imported since that module also
// pulls in card-specific View/VIEWS exports this page has no use for; the
// logic itself is generic over SearchParamsInput, reimplemented here rather
// than forcing an import that would drag card concepts into the decklist
// results page.
function hrefWithOverrides(
  basePath: string,
  searchParams: SearchParamsInput,
  overrides: Record<string, string>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key in overrides || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else {
      params.set(key, value);
    }
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "date", label: "Date" },
];

export default async function AdvancedDecklistResultsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  const rawParams = await searchParams;
  const params = parseAdvancedDecklistSearchParams(rawParams);

  const { items, total, page, pageSize, totalPages } =
    await searchDecklistsAdvanced(params);

  // Read-only summary of the active query - without it the page can't
  // explain its own count, same reasoning as /cards/advanced/results.
  const summaryParts: string[] = [];
  if (params.name) summaryParts.push(`Name “${params.name}”`);
  if (params.identity) summaryParts.push(`Identity ${formatCode(params.identity)}`);
  if (params.faction.length) {
    summaryParts.push(`Faction ${params.faction.map(formatCode).join(", ")}`);
  }
  if (params.side) summaryParts.push(`Side ${formatCode(params.side)}`);
  if (params.pack.length) {
    summaryParts.push(`Pack ${params.pack.map(formatCode).join(", ")}`);
  }
  if (params.cardsUsed.length) {
    summaryParts.push(`Cards used ${params.cardsUsed.map(formatCode).join(", ")}`);
  }
  if (params.cardsExcluded.length) {
    summaryParts.push(
      `Cards excluded ${params.cardsExcluded.map(formatCode).join(", ")}`,
    );
  }
  if (params.authorId) summaryParts.push(`Author ${params.authorId}`);
  if (params.fuzzy) summaryParts.push("Fuzzy matching on");

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Search results</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link href={editSearchHref(rawParams)} className="underline">
            Edit search
          </Link>
          <Link href="/decklists" className="underline">
            Quick views
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
            No criteria — showing every decklist.{" "}
            <Link href="/decklists/advanced" className="underline">
              Add some
            </Link>
            .
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {total} decklist{total === 1 ? "" : "s"} found
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">Sort</span>
            <div className="flex items-center gap-2">
              {SORT_OPTIONS.map((o) => (
                <Link
                  key={o.value}
                  href={hrefWithOverrides("/decklists/advanced/results", rawParams, {
                    order: o.value,
                    page: "",
                  })}
                  aria-current={params.order === o.value ? "true" : undefined}
                  className={
                    params.order === o.value
                      ? "font-semibold underline"
                      : "text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200"
                  }
                >
                  {o.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">Per page</span>
            <div className="flex items-center gap-2">
              {PAGE_SIZE_OPTIONS.map((size) => (
                <Link
                  key={size}
                  href={hrefWithOverrides("/decklists/advanced/results", rawParams, {
                    pageSize: String(size),
                    page: "",
                  })}
                  aria-current={pageSize === size ? "true" : undefined}
                  className={
                    pageSize === size
                      ? "font-semibold underline"
                      : "text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200"
                  }
                >
                  {size}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {items.map((decklist) => (
          <li
            key={decklist.id}
            className="flex items-center justify-between gap-3 py-2"
          >
            <div className="flex min-w-0 flex-col">
              <Link
                href={`/decklists/${decklist.id}`}
                className="truncate font-medium underline"
              >
                {decklist.name}
              </Link>
              <Link
                href={`/cards/${decklist.identityCode}`}
                className="text-sm text-zinc-500 underline"
              >
                {decklist.identityTitle}
              </Link>
            </div>
            <span className="text-sm text-zinc-500">
              {decklist.createdAt
                ? new Date(decklist.createdAt).toISOString().slice(0, 10)
                : "—"}
            </span>
          </li>
        ))}
        {items.length === 0 && (
          <li className="py-4 text-sm text-zinc-500">
            No decklists match this search.
          </li>
        )}
      </ul>

      <PaginationNav
        basePath="/decklists/advanced/results"
        searchParams={rawParams}
        page={page}
        totalPages={totalPages}
      />
    </main>
  );
}
