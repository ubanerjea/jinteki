import Link from "next/link";
import { Prisma } from "@prisma/client";

import { FacetPicker, type FacetOption } from "@/components/facet-picker";
import { ORDER_OPTIONS, PAGE_SIZE_OPTIONS } from "@/components/results-controls";
import { formatCode } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { parseAdvancedCardSearchParams } from "@/lib/search/cards-advanced";
import type { SearchParamsInput } from "@/lib/search/types";

export const dynamic = "force-dynamic";

// The structured search form (PHASE_7_PLAN.md item 5,
// ADVANCED_CARD_SEARCH_PLAN.md "Form layout").
//
// **This page renders no results at all** - it is a form, and only a form.
// Results live at /cards/advanced/results. The form is eleven rows tall;
// results cannot sit under it usefully, which is the whole reason the
// advanced side is two routes while simple search is one.
//
// It does read `searchParams`, but only to restore its own field values when
// arrived at from the results page's "Edit search" link or from a facet link
// elsewhere in the app.

// One criterion per row: label in a fixed left column, field plus hint on
// the right, hairline rule between rows.
function Row({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border-t border-zinc-200 py-3 sm:flex-row sm:gap-4 dark:border-zinc-800">
      <label
        htmlFor={htmlFor}
        className="shrink-0 pt-1.5 text-sm font-medium sm:w-[132px] sm:text-right"
      >
        {label}
      </label>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {children}
        {hint && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
        )}
      </div>
    </div>
  );
}

const INPUT_CLASS =
  "w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export default async function AdvancedCardSearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  const rawParams = await searchParams;
  // Reuses the results page's parser so a value typed as `f:anarch` in the
  // Card Name box comes back pre-folded into the Faction picker on "Edit
  // search", exactly as the results it produced were filtered.
  const params = parseAdvancedCardSearchParams(rawParams);

  // Picker option data, fetched in the existing Promise.all style. These are
  // the four queries that used to populate /cards' dropdowns - moved here,
  // not duplicated (PHASE_7_PLAN.md item 8).
  const [factions, typeRows, keywordRows, packs, formats] = await Promise.all([
    prisma.faction.findMany({ orderBy: { code: "asc" }, select: { code: true } }),
    prisma.card.groupBy({ by: ["typeCode"], orderBy: { typeCode: "asc" } }),
    prisma.$queryRaw<{ keyword: string }[]>(
      Prisma.sql`SELECT DISTINCT unnest(keywords) AS keyword FROM "Card" ORDER BY 1`,
    ),
    prisma.pack.findMany({ orderBy: { name: "asc" } }),
    prisma.format.findMany({ orderBy: { name: "asc" } }),
  ]);

  const typeOptions: FacetOption[] = typeRows.map((t) => ({
    value: t.typeCode,
    label: formatCode(t.typeCode),
  }));
  const factionOptions: FacetOption[] = factions.map((f) => ({
    value: f.code,
    label: formatCode(f.code),
  }));
  const keywordOptions: FacetOption[] = keywordRows.map((k) => ({
    value: k.keyword,
    label: formatCode(k.keyword),
  }));
  const packOptions: FacetOption[] = packs.map((p) => ({
    value: p.code,
    label: p.name,
  }));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Advanced Card Search</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/cards" className="underline">
            Simple search
          </Link>
          <Link href="/" className="underline">
            Home
          </Link>
        </div>
      </div>

      <form method="get" action="/cards/advanced/results" className="flex flex-col">
        <Row
          label="Card Name"
          htmlFor="adv-title"
          hint={
            <>
              Matches the card&apos;s title only. Prefixes work here too, e.g.{" "}
              <code>f:anarch</code> or <code>s:virus</code> —{" "}
              <Link href="/cards/syntax" className="underline">
                search syntax help
              </Link>
              .
            </>
          }
        >
          <input
            id="adv-title"
            type="text"
            name="title"
            defaultValue={params.title ?? ""}
            placeholder="e.g. Sure Gamble"
            className={INPUT_CLASS}
          />
        </Row>

        <Row
          label="Card Text"
          htmlFor="adv-text"
          hint="Matches the card's rules text only. Fill both boxes and a card has to match both."
        >
          <input
            id="adv-text"
            type="text"
            name="text"
            defaultValue={params.text ?? ""}
            placeholder="e.g. gain 4[credit]"
            className={INPUT_CLASS}
          />
        </Row>

        <Row
          label="Matching"
          hint={
            <>
              Off by default — searches are plain substring matches unless you
              tick this. Ticking it also finds near-misses and typos, ranked
              below solid matches. Simple search is always forgiving this way:{" "}
              <Link href="/cards" className="underline">
                use simple search
              </Link>{" "}
              if you want that without thinking about it.
            </>
          }
        >
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="fuzzy"
              value="1"
              defaultChecked={params.fuzzy}
              className="rounded border-zinc-300 dark:border-zinc-700"
            />
            Also find close matches (fuzzy)
          </label>
        </Row>

        <Row label="Type" hint="Pick one or more. Several means any of them.">
          <FacetPicker
            name="type"
            label="Type"
            options={typeOptions}
            selected={params.type}
            placeholder="Any type"
          />
        </Row>

        <Row label="Faction" hint="Pick one or more. Several means any of them.">
          <FacetPicker
            name="faction"
            label="Faction"
            options={factionOptions}
            selected={params.faction}
            placeholder="Any faction"
          />
        </Row>

        <Row
          label="Subtype"
          hint="Pick one or more. A card matching any one of them is included."
        >
          <FacetPicker
            name="keyword"
            label="Subtype"
            options={keywordOptions}
            selected={params.keyword}
            placeholder="Any subtype"
          />
        </Row>

        <Row label="Pack" hint="Pick one or more. Several means any of them.">
          <FacetPicker
            name="pack"
            label="Pack"
            options={packOptions}
            selected={params.pack}
            placeholder="Any pack"
          />
        </Row>

        <Row label="Side" htmlFor="adv-side">
          <select
            id="adv-side"
            name="side"
            defaultValue={params.side ?? ""}
            className={INPUT_CLASS}
          >
            <option value="">Any side</option>
            <option value="corp">{formatCode("corp")}</option>
            <option value="runner">{formatCode("runner")}</option>
          </select>
        </Row>

        <Row
          label="Format"
          htmlFor="adv-format"
          hint="Cards in that format's card pool, not just those currently legal in it."
        >
          <select
            id="adv-format"
            name="format"
            defaultValue={params.format ?? ""}
            className={INPUT_CLASS}
          >
            <option value="">Any format</option>
            {formats.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Row>

        <h2 className="mt-4 border-t border-zinc-200 pt-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
          Preferences
        </h2>

        <Row
          label="Sort by"
          htmlFor="adv-order"
          hint="Relevance only differs from Title when fuzzy matching is on."
        >
          <select
            id="adv-order"
            name="order"
            defaultValue={params.order ?? ""}
            className={INPUT_CLASS}
          >
            {ORDER_OPTIONS.map((o) => (
              <option key={o.value || "relevance"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Cards per page" htmlFor="adv-page-size">
          <select
            id="adv-page-size"
            name="pageSize"
            defaultValue={String(params.pageSize)}
            className={INPUT_CLASS}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </Row>

        <div className="flex items-center gap-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <button
            type="submit"
            className="rounded bg-foreground px-4 py-1.5 text-sm font-medium text-background"
          >
            Search
          </button>
          <Link href="/cards/advanced" className="text-sm underline">
            Reset
          </Link>
        </div>
      </form>
    </main>
  );
}
