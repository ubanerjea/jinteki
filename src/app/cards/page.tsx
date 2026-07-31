import Link from "next/link";
import { Prisma } from "@prisma/client";

import { CardReference } from "@/components/card-reference";
import { PaginationNav } from "@/components/pagination-nav";
import { getCardImageUrl } from "@/lib/card-image";
import { formatCode } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { parseCardSearchParams, searchCards } from "@/lib/search/cards";
import type { SearchParamsInput } from "@/lib/search/types";

export const dynamic = "force-dynamic";

type View = "list" | "grid";

function parseView(input: SearchParamsInput): View {
  const raw = input.view;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "grid" ? "grid" : "list";
}

// Builds an href that preserves every current search param except the ones
// being overridden - same "URL is the source of truth" approach as
// PaginationNav's hrefForPage, used here for the list/grid view toggle
// links (a rendering-mode switch on data already fetched, per
// PHASE_5_PLAN.md - no new query).
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

// Next.js App Router passes `searchParams` as a Promise (same async-prop
// convention already used for route `params` in
// src/api/admin/sync/[type]/route.ts). URL searchParams are the entire
// source of truth for list/filter state - no client component, no local
// state, per PHASE_4_PLAN.md.
export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  const rawParams = await searchParams;
  const params = parseCardSearchParams(rawParams);
  const view = parseView(rawParams);

  const [{ items, total, page, pageSize, totalPages }, factions, typeRows, keywordRows] =
    await Promise.all([
      searchCards(params),
      prisma.faction.findMany({ orderBy: { code: "asc" }, select: { code: true } }),
      prisma.card.groupBy({ by: ["typeCode"], orderBy: { typeCode: "asc" } }),
      prisma.$queryRaw<{ keyword: string }[]>(
        Prisma.sql`SELECT DISTINCT unnest(keywords) AS keyword FROM "Card" ORDER BY 1`,
      ),
    ]);

  const sides = ["corp", "runner"];
  const orderOptions = [
    { value: "", label: "Relevance / Title" },
    { value: "title", label: "Title" },
    { value: "faction", label: "Faction" },
    { value: "type", label: "Type" },
  ];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cards</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/cards/random" className="underline">
            Random card
          </Link>
          <Link href="/" className="underline">
            Home
          </Link>
        </div>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Search (title/text)
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="e.g. Sure Gamble"
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Faction
          <select
            name="faction"
            defaultValue={params.faction ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All</option>
            {factions.map((f) => (
              <option key={f.code} value={f.code}>
                {formatCode(f.code)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Side
          <select
            name="side"
            defaultValue={params.side ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All</option>
            {sides.map((s) => (
              <option key={s} value={s}>
                {formatCode(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Type
          <select
            name="type"
            defaultValue={params.type ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All</option>
            {typeRows.map((t) => (
              <option key={t.typeCode} value={t.typeCode}>
                {formatCode(t.typeCode)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Keyword
          <select
            name="keyword"
            defaultValue={params.keyword ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All</option>
            {keywordRows.map((k) => (
              <option key={k.keyword} value={k.keyword}>
                {formatCode(k.keyword)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Sort
          <select
            name="order"
            defaultValue={params.order ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {orderOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <input type="hidden" name="view" value={view} />
        <button
          type="submit"
          className="rounded bg-foreground px-4 py-1.5 text-sm font-medium text-background"
        >
          Search
        </button>
      </form>

      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {total} card{total === 1 ? "" : "s"} found
        </p>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={hrefWithOverrides("/cards", rawParams, { view: "list" })}
            className={view === "list" ? "font-semibold underline" : "text-zinc-500 underline"}
          >
            List
          </Link>
          <Link
            href={hrefWithOverrides("/cards", rawParams, { view: "grid" })}
            className={view === "grid" ? "font-semibold underline" : "text-zinc-500 underline"}
          >
            Grid
          </Link>
        </div>
      </div>

      {view === "list" ? (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {items.map((card) => (
            <li key={card.code} className="flex items-center justify-between py-2">
              <CardReference code={card.code}>
                <Link href={`/cards/${card.code}`} className="font-medium underline">
                  {card.title}
                </Link>
              </CardReference>
              <span className="text-sm text-zinc-500">
                {formatCode(card.factionCode)} - {formatCode(card.typeCode)} -{" "}
                {formatCode(card.sideCode)}
              </span>
            </li>
          ))}
          {items.length === 0 && (
            <li className="py-4 text-sm text-zinc-500">No cards match this search.</li>
          )}
        </ul>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((card) => {
            const imageUrl = getCardImageUrl(card.raw, "small");
            return (
              <CardReference key={card.code} code={card.code} className="block">
                <Link href={`/cards/${card.code}`} className="flex flex-col gap-1">
                  {imageUrl ? (
                    // Hotlinked, same no-next/image convention as
                    // /cards/[code] - see that page for the full reasoning.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl}
                      alt={card.title}
                      className="w-full rounded border border-zinc-200 dark:border-zinc-800"
                    />
                  ) : (
                    <div className="flex aspect-[5/7] w-full items-center justify-center rounded border border-zinc-200 p-2 text-center text-xs text-zinc-500 dark:border-zinc-800">
                      {card.title}
                    </div>
                  )}
                  <span className="truncate text-xs font-medium">{card.title}</span>
                </Link>
              </CardReference>
            );
          })}
          {items.length === 0 && (
            <p className="col-span-full py-4 text-sm text-zinc-500">
              No cards match this search.
            </p>
          )}
        </div>
      )}

      <PaginationNav
        basePath="/cards"
        searchParams={rawParams}
        page={page}
        totalPages={totalPages}
      />
      <p className="text-xs text-zinc-400">
        Page size {pageSize}.
      </p>
    </main>
  );
}
