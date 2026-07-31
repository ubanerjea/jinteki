import Link from "next/link";

import { PaginationNav } from "@/components/pagination-nav";
import {
  parseRuleSectionSearchParams,
  searchRuleSections,
} from "@/lib/search/rule-sections";
import type { SearchParamsInput } from "@/lib/search/types";

export const dynamic = "force-dynamic";

// Rules-glossary list/search page, mirroring /cards and /decklists'
// searchParams-driven pattern exactly (PHASE_5_PLAN.md: "reusing Phase 4's
// PaginationNav and searchParams-driven pattern exactly"). No structured
// filters - the rules doc has no equivalent to faction/side/type.
export default async function RulesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  const rawParams = await searchParams;
  const params = parseRuleSectionSearchParams(rawParams);

  const { items, total, page, pageSize, totalPages } =
    await searchRuleSections(params);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Comprehensive Rules</h1>
        <Link href="/" className="text-sm underline">
          Home
        </Link>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Search (title/body text)
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="e.g. sabotage"
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-foreground px-4 py-1.5 text-sm font-medium text-background"
        >
          Search
        </button>
      </form>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {total} section{total === 1 ? "" : "s"} found
      </p>

      <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {items.map((section) => (
          <li key={section.id} className="flex flex-col gap-1 py-3">
            <Link
              href={`/rules/${section.id}`}
              className="font-medium underline"
            >
              {section.id} {section.title}
            </Link>
            <p className="line-clamp-2 text-sm text-zinc-500">
              {section.bodyText}
            </p>
          </li>
        ))}
        {items.length === 0 && (
          <li className="py-4 text-sm text-zinc-500">
            No rules sections match this search.
          </li>
        )}
      </ul>

      <PaginationNav
        basePath="/rules"
        searchParams={rawParams}
        page={page}
        totalPages={totalPages}
      />
      <p className="text-xs text-zinc-400">Page size {pageSize}.</p>
    </main>
  );
}
