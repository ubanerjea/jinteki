import Link from "next/link";

import { PaginationNav } from "@/components/pagination-nav";
import {
  DECKLIST_TABS,
  parseDecklistTab,
  searchDecklistsByTab,
  type DecklistTabRow,
} from "@/lib/search/decklists";
import { parsePage, parsePageSize } from "@/lib/search/pagination";
import { firstParam, type SearchParamsInput } from "@/lib/search/types";

export const dynamic = "force-dynamic";

// /decklists quick-views landing page (PHASE_8_PLAN.md item 2). Replaces the
// old hybrid search+list page entirely: no <form>, no text input, no
// <select> - a row of tab links (mirroring ResultsControls' ControlLink
// pattern) plus a results list plus pagination. Structured filtering moved
// entirely to /decklists/advanced.

function tabHref(tab: string, searchParams: SearchParamsInput): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "tab" || key === "page" || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else {
      params.set(key, value);
    }
  }
  if (tab !== "recent") params.set("tab", tab);
  const qs = params.toString();
  return qs ? `/decklists?${qs}` : "/decklists";
}

// Per-tab: whichever field the tab is sorted by is never invisible - Recent/
// Posted-this-week show the post date, Recently-updated shows the updated
// date, Favorited shows the favorite count (PHASE_8_PLAN.md item 2).
function SortKey({ tab, row }: { tab: string; row: DecklistTabRow }) {
  if (tab === "favorited") {
    return (
      <span className="text-sm text-zinc-500">
        {row.favoriteCount} favorite{row.favoriteCount === 1 ? "" : "s"}
      </span>
    );
  }
  const date = tab === "updated" ? row.updatedAt : row.createdAt;
  return (
    <span className="text-sm text-zinc-500">
      {date ? new Date(date).toISOString().slice(0, 10) : "—"}
    </span>
  );
}

const EMPTY_MESSAGES: Record<string, string> = {
  favorited: "No decklists have been favorited by jinteki users yet.",
  week: "No decklists have been posted in the last 7 days.",
  recent: "No decklists found.",
  updated: "No decklists found.",
};

export default async function DecklistsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  const rawParams = await searchParams;
  const tab = parseDecklistTab(rawParams);
  const page = parsePage(firstParam(rawParams, "page"));
  const pageSize = parsePageSize(firstParam(rawParams, "pageSize"));

  const { items, total, totalPages } = await searchDecklistsByTab({
    tab,
    page,
    pageSize,
  });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Decklists</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/decklists/advanced" className="underline">
            Search
          </Link>
          <Link href="/decklists/new" className="underline">
            New decklist
          </Link>
          <Link href="/" className="underline">
            Home
          </Link>
        </div>
      </div>

      <nav
        aria-label="Decklist quick views"
        className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm"
      >
        {DECKLIST_TABS.map((t) => (
          <Link
            key={t.value}
            href={tabHref(t.value, rawParams)}
            aria-current={tab === t.value ? "true" : undefined}
            className={
              tab === t.value
                ? "font-semibold underline"
                : "text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200"
            }
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {total} decklist{total === 1 ? "" : "s"}
      </p>

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
            <SortKey tab={tab} row={decklist} />
          </li>
        ))}
        {items.length === 0 && (
          <li className="py-4 text-sm text-zinc-500">
            {EMPTY_MESSAGES[tab]}
          </li>
        )}
      </ul>

      <PaginationNav
        basePath="/decklists"
        searchParams={rawParams}
        page={page}
        totalPages={totalPages}
      />
      <p className="text-xs text-zinc-400">Page size {pageSize}.</p>
    </main>
  );
}
