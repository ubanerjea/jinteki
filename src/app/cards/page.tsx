import Link from "next/link";

import { PaginationNav } from "@/components/pagination-nav";
import { formatCode } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { parseCardSearchParams, searchCards } from "@/lib/search/cards";
import type { SearchParamsInput } from "@/lib/search/types";

export const dynamic = "force-dynamic";

// Next.js App Router passes `searchParams` as a Promise (same async-prop
// convention already used for route `params` in
// src/app/api/admin/sync/[type]/route.ts). URL searchParams are the entire
// source of truth for list/filter state - no client component, no local
// state, per PHASE_4_PLAN.md.
export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  const rawParams = await searchParams;
  const params = parseCardSearchParams(rawParams);

  const [{ items, total, page, pageSize, totalPages }, factions, typeRows] =
    await Promise.all([
      searchCards(params),
      prisma.faction.findMany({ orderBy: { code: "asc" }, select: { code: true } }),
      prisma.card.groupBy({ by: ["typeCode"], orderBy: { typeCode: "asc" } }),
    ]);

  const sides = ["corp", "runner"];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cards</h1>
        <Link href="/" className="text-sm underline">
          Home
        </Link>
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
        <button
          type="submit"
          className="rounded bg-foreground px-4 py-1.5 text-sm font-medium text-background"
        >
          Search
        </button>
      </form>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {total} card{total === 1 ? "" : "s"} found
      </p>

      <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {items.map((card) => (
          <li key={card.code} className="flex items-center justify-between py-2">
            <Link href={`/cards/${card.code}`} className="font-medium underline">
              {card.title}
            </Link>
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
