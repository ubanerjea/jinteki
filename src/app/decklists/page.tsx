import Link from "next/link";

import { PaginationNav } from "@/components/pagination-nav";
import { prisma } from "@/lib/prisma";
import {
  parseDecklistSearchParams,
  searchDecklists,
} from "@/lib/search/decklists";
import type { SearchParamsInput } from "@/lib/search/types";

export const dynamic = "force-dynamic";

export default async function DecklistsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  const rawParams = await searchParams;
  const params = parseDecklistSearchParams(rawParams);

  const [{ items, total, page, pageSize, totalPages }, identities] =
    await Promise.all([
      searchDecklists(params),
      // Only identities actually used by at least one decklist (148 of
      // them, not all ~2000 cards) - a normal relational filter via the
      // existing Card.decklistsAsIdentity relation, not raw SQL.
      prisma.card.findMany({
        where: { decklistsAsIdentity: { some: {} } },
        select: { code: true, title: true },
        orderBy: { title: "asc" },
      }),
    ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Decklists</h1>
        <Link href="/" className="text-sm underline">
          Home
        </Link>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Search (name)
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="e.g. NBN Rush"
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Identity
          <select
            name="identity"
            defaultValue={params.identity ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All</option>
            {identities.map((identity) => (
              <option key={identity.code} value={identity.code}>
                {identity.title}
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
        {total} decklist{total === 1 ? "" : "s"} found
      </p>

      <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {items.map((decklist) => (
          <li
            key={decklist.id}
            className="flex items-center justify-between py-2"
          >
            <Link
              href={`/decklists/${decklist.id}`}
              className="font-medium underline"
            >
              {decklist.name}
            </Link>
            <Link
              href={`/cards/${decklist.identityCode}`}
              className="text-sm text-zinc-500 underline"
            >
              {decklist.identityTitle}
            </Link>
          </li>
        ))}
        {items.length === 0 && (
          <li className="py-4 text-sm text-zinc-500">
            No decklists match this search.
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
