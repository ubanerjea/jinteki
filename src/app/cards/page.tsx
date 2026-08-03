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

// Item 5 (PHASE_6_PLAN.md): two more view modes beyond the existing
// list/grid toggle - "checklist" (denser one-row-per-card) and "names"
// (linked titles only, no metadata). Deliberately not chasing NRDB's full
// six "View as" modes - see PHASE_6_PLAN.md item 5's reasoning.
type View = "list" | "grid" | "checklist" | "names";
const VIEWS: View[] = ["list", "grid", "checklist", "names"];

function parseView(input: SearchParamsInput): View {
  const raw = input.view;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (VIEWS as string[]).includes(value ?? "") ? (value as View) : "list";
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

  const [
    { items, total, page, pageSize, totalPages },
    factions,
    typeRows,
    keywordRows,
    packs,
    formats,
  ] = await Promise.all([
    searchCards(params),
    prisma.faction.findMany({ orderBy: { code: "asc" }, select: { code: true } }),
    prisma.card.groupBy({ by: ["typeCode"], orderBy: { typeCode: "asc" } }),
    prisma.$queryRaw<{ keyword: string }[]>(
      Prisma.sql`SELECT DISTINCT unnest(keywords) AS keyword FROM "Card" ORDER BY 1`,
    ),
    // Item 1: pack filter dropdown, labeled by Pack.name (human-readable
    // already, e.g. "Core Set") rather than formatCode(), unlike
    // faction/type/keyword's lowercase-underscore codes.
    prisma.pack.findMany({ orderBy: { name: "asc" } }),
    // format-descriptions-links-and-search-plan.md §5, Option A: format
    // filter dropdown, labeled by Format.name (already human-readable, e.g.
    // "System Gateway") - same treatment as the pack dropdown above, no
    // formatCode() needed.
    prisma.format.findMany({ orderBy: { name: "asc" } }),
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
          Pack
          <select
            name="pack"
            defaultValue={params.pack ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All</option>
            {packs.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Format
          <select
            name="format"
            defaultValue={params.format ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All</option>
            {formats.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
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
          <Link
            href={hrefWithOverrides("/cards", rawParams, { view: "checklist" })}
            className={view === "checklist" ? "font-semibold underline" : "text-zinc-500 underline"}
          >
            Checklist
          </Link>
          <Link
            href={hrefWithOverrides("/cards", rawParams, { view: "names" })}
            className={view === "names" ? "font-semibold underline" : "text-zinc-500 underline"}
          >
            Names only
          </Link>
        </div>
      </div>

      {view === "names" ? (
        // Item 5: maximum-density mode - just linked titles, no metadata at
        // all, wrapped in a flex layout (closest analog to NRDB's own
        // "Names only" mode).
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {items.map((card) => (
            <CardReference key={card.code} code={card.code}>
              <Link href={`/cards/${card.code}`} className="underline">
                {card.title}
              </Link>
            </CardReference>
          ))}
          {items.length === 0 && (
            <p className="py-4 text-sm text-zinc-500">No cards match this search.</p>
          )}
        </div>
      ) : view === "checklist" ? (
        // Item 5: denser than `list` - tighter vertical rhythm (py-0.5 vs
        // py-2), title + a single compact abbreviated stat summary instead
        // of separate spans. Good for scanning a whole pack once item 1's
        // pack filter narrows the list down.
        <ul className="flex flex-col divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          {items.map((card) => (
            <li key={card.code} className="flex items-center justify-between py-0.5">
              <CardReference code={card.code}>
                <Link href={`/cards/${card.code}`} className="underline">
                  {card.title}
                </Link>
              </CardReference>
              <span className="text-xs text-zinc-500">
                {formatCode(card.factionCode)[0]}/{formatCode(card.typeCode)[0]}
              </span>
            </li>
          ))}
          {items.length === 0 && (
            <li className="py-4 text-sm text-zinc-500">No cards match this search.</li>
          )}
        </ul>
      ) : view === "list" ? (
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((card) => {
            // "large" (300x420), not "small" (116x162) - same asset already
            // fetched by /cards/[code] (which displays it at a fixed
            // w-[300px] - that's our ceiling), reused here rather than
            // introducing a new size tier.
            //
            // Column counts verified against real numbers, not guesses: this
            // page's container is max-w-4xl (896px) with px-6 (24px/side)
            // padding, so content width caps at 896-48=848px for any
            // viewport >=944px - which covers virtually every desktop/laptop
            // width. gap-3 is 12px. At 3 columns that's
            // (848-2*12)/3 = 274.67px/cell: close to the 300px native cap
            // without touching it (up from the previous 4-column 203px -
            // ~35% wider, ~83% more area). Below the sm breakpoint (640px,
            // e.g. phones) it stays at the original 2 columns, topping out
            // at (639-48-12)/2 = 289.5px right before sm kicks in - also
            // under 300px, so mobile is unaffected.
            //
            // The previous md:grid-cols-3 lg:grid-cols-4 tiers are
            // deliberately removed, not just widened: they were actively
            // harmful. Just below lg (md, up to viewport 1023), content
            // could reach 975px, and 3 columns there gave
            // (975-48-24)/3=317.7px - already exceeding the 300px cap (a
            // latent upscaling-blur bug independent of this pass). Then
            // crossing into lg's 4 columns made cells suddenly *shrink* to
            // 203px - a jarring regression right at the breakpoint. Since
            // this container's width caps at 896px regardless of viewport
            // beyond ~944px, there's nothing to gain from a further md/lg
            // split - one sm breakpoint is enough, and it never overshoots.
            //
            // The max-w-[300px] below is a hard backstop for both of the
            // above: given the arithmetic above, no breakpoint here ever
            // produces a cell over 300px, so this is a no-op in normal
            // operation - but it guarantees the "never upscale past native
            // resolution" invariant even if this container's width, padding,
            // or gap drifts later.
            const imageUrl = getCardImageUrl(card.raw, "large");
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
                      className="w-full max-w-[300px] rounded border border-zinc-200 dark:border-zinc-800"
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
