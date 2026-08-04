import Link from "next/link";

import { FacetPicker, type FacetOption } from "@/components/facet-picker";
import { ORDER_OPTIONS, PAGE_SIZE_OPTIONS } from "@/components/results-controls";
import { SimpleSearchBox } from "@/components/simple-search-box";
import { prisma } from "@/lib/prisma";
import { parseAdvancedCardSearchParams } from "@/lib/search/cards-advanced";
import { getPrefixOptions } from "@/lib/search/prefix-options";
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
  // Reuses the results page's parser so every field comes back exactly as the
  // results it produced were filtered, on "Edit search".
  const params = parseAdvancedCardSearchParams(rawParams);

  // Picker option data, fetched in the existing Promise.all style.
  // Faction / Type / Subtype / Side come from the shared getPrefixOptions(),
  // which the home page and /cards also call for the Simple search box's
  // type-ahead - one definition of each list rather than three copies of the
  // same three queries. Pack and Format are only needed here, so they stay
  // here.
  const [prefixOptions, packs, formats] = await Promise.all([
    getPrefixOptions(),
    prisma.pack.findMany({ orderBy: { name: "asc" } }),
    prisma.format.findMany({ orderBy: { name: "asc" } }),
  ]);

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

      {/* A separate form from the criteria form below, posting to /cards -
          this is simple search, embedded for convenience, not another way to
          drive the advanced query. Same engine as /cards (one box matching
          title or text, always fuzzy), so it is the one place on this page
          where the f:/t:/s:/d: prefix syntax applies. The criteria form's
          Card Name / Card Text fields are pure literal text; they have real
          pickers for those four facets a few rows down.

          It does not breach "this page renders no results": submitting
          navigates to /cards, exactly as the Simple search link in the header
          above already does - now with a working box attached to it. */}
      <div className="flex flex-col gap-1 rounded border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <form method="get" action="/cards" className="flex flex-col gap-1">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
            <label
              htmlFor="adv-simple-q"
              className="shrink-0 text-sm font-medium sm:w-[132px] sm:text-right"
            >
              Simple search
            </label>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <SimpleSearchBox
                name="q"
                ariaLabel="Simple search"
                placeholder="e.g. Sure Gamble"
                options={prefixOptions}
                containerClassName="min-w-0 flex-1"
                className={INPUT_CLASS}
                inputId="adv-simple-q"
              />
              <button
                type="submit"
                className="rounded bg-foreground px-4 py-1.5 text-sm font-medium text-background"
              >
                Search
              </button>
            </div>
          </div>
        </form>
        <p className="text-xs text-zinc-500 sm:pl-[148px] dark:text-zinc-400">
          One box, matching card names and rules text together, always
          forgiving of typos. Accepts <code>f:</code> <code>t:</code>{" "}
          <code>s:</code> <code>d:</code> prefixes, e.g. <code>f:anarch</code>{" "}
          or <code>s:virus</code>, and completes their values as you type —{" "}
          <Link href="/cards/syntax" className="underline">
            search syntax help
          </Link>
          .
        </p>
      </div>

      <form method="get" action="/cards/advanced/results" className="flex flex-col">
        <Row
          label="Card Name"
          htmlFor="adv-title"
          hint="Matches the card's title only."
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
            options={prefixOptions.type}
            selected={params.type}
            placeholder="Any type"
          />
        </Row>

        <Row label="Faction" hint="Pick one or more. Several means any of them.">
          <FacetPicker
            name="faction"
            label="Faction"
            options={prefixOptions.faction}
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
            options={prefixOptions.keyword}
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
            {prefixOptions.side.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
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
