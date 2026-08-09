import Link from "next/link";

import { FacetPicker, type FacetOption } from "@/components/facet-picker";
import { PAGE_SIZE_OPTIONS } from "@/components/results-controls";
import { prisma } from "@/lib/prisma";
import { parseAdvancedDecklistSearchParams } from "@/lib/search/decklists-advanced";
import { getPrefixOptions } from "@/lib/search/prefix-options";
import type { SearchParamsInput } from "@/lib/search/types";

export const dynamic = "force-dynamic";

// The structured decklist search form (PHASE_8_PLAN.md item 4). Mirrors
// /cards/advanced's layout conventions directly (same Row pattern, same page
// chrome) since there is no separate mockup for this phase.
//
// **This page renders no results at all** - it is a form, and only a form.
// Results live at /decklists/advanced/results.
//
// It does read `searchParams`, but only to restore its own field values when
// arrived at from the results page's "Edit search" link.

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

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "date", label: "Date" },
];

export default async function AdvancedDecklistSearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  const rawParams = await searchParams;
  const params = parseAdvancedDecklistSearchParams(rawParams);

  const [prefixOptions, packs, identities, cards, formats] = await Promise.all([
    getPrefixOptions(),
    prisma.pack.findMany({ orderBy: { name: "asc" } }),
    // Only identities actually used by at least one decklist - the same
    // relational filter /decklists' old hybrid page already ran, moved into
    // this page's data-fetching per PHASE_8_PLAN.md item 3.
    prisma.card.findMany({
      where: { decklistsAsIdentity: { some: {} } },
      select: { code: true, title: true },
      orderBy: { title: "asc" },
    }),
    // Full card list for the Cards used/excluded pickers (~2054 options) -
    // the first time FacetPicker's client-side substring filtering is fed
    // the *full* card list rather than a smaller faction/type/pack list;
    // confirmed responsive at this option count during build-time
    // verification (see agent-reports/phase-8.md).
    prisma.card.findMany({
      select: { code: true, title: true },
      orderBy: { title: "asc" },
    }),
    // Same prisma.format.findMany() call /cards/advanced's own Format row
    // already uses - nothing new (addendum, 2026-08-08).
    prisma.format.findMany({ orderBy: { name: "asc" } }),
  ]);

  const packOptions: FacetOption[] = packs.map((p) => ({
    value: p.code,
    label: p.name,
  }));
  const cardOptions: FacetOption[] = cards.map((c) => ({
    value: c.code,
    label: c.title,
  }));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Advanced Decklist Search</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/decklists" className="underline">
            Quick views
          </Link>
          <Link href="/" className="underline">
            Home
          </Link>
        </div>
      </div>

      <form
        method="get"
        action="/decklists/advanced/results"
        className="flex flex-col"
      >
        <Row
          label="Decklist Name"
          htmlFor="adv-name"
          hint="Matches the decklist's name."
        >
          <input
            id="adv-name"
            type="text"
            name="name"
            defaultValue={params.name ?? ""}
            placeholder="e.g. NBN Rush"
            className={INPUT_CLASS}
          />
        </Row>

        <Row
          label="Matching"
          hint="Off by default - a plain substring match. Ticking it also finds near-misses and typos, ranked below solid matches."
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

        <Row label="Identity" htmlFor="adv-identity">
          <select
            id="adv-identity"
            name="identity"
            defaultValue={params.identity ?? ""}
            className={INPUT_CLASS}
          >
            <option value="">Any identity</option>
            {identities.map((identity) => (
              <option key={identity.code} value={identity.code}>
                {identity.title}
              </option>
            ))}
          </select>
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

        {/* Card-pool-membership Format filter (addendum, 2026-08-08) - placed
            directly after Side, mirroring /cards/advanced's own row order.
            Hint text is verbatim identical to /cards/advanced's Format row
            hint (src/app/cards/advanced/page.tsx) - the same honest caveat,
            about the same underlying data ("every card in this deck a member
            of the format's card pool," not legality). */}
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

        <Row
          label="Pack"
          hint="Decks containing at least one card from any of the selected packs."
        >
          <FacetPicker
            name="pack"
            label="Pack"
            options={packOptions}
            selected={params.pack}
            placeholder="Any pack"
          />
        </Row>

        <Row
          label="Cards used"
          hint="Decks containing every card selected here."
        >
          <FacetPicker
            name="cardsUsed"
            label="Cards used"
            options={cardOptions}
            selected={params.cardsUsed}
            placeholder="Any cards"
          />
        </Row>

        <Row
          label="Cards excluded"
          hint="Decks containing none of the cards selected here."
        >
          <FacetPicker
            name="cardsExcluded"
            label="Cards excluded"
            options={cardOptions}
            selected={params.cardsExcluded}
            placeholder="No exclusions"
          />
        </Row>

        <Row
          label="Author"
          htmlFor="adv-author"
          hint="A raw NetrunnerDB user id, not a display name - jinteki has no synced NRDB-user directory to resolve one to the other."
        >
          <input
            id="adv-author"
            type="text"
            name="authorId"
            defaultValue={params.authorId ?? ""}
            placeholder="e.g. Alsciende"
            className={INPUT_CLASS}
          />
        </Row>

        <h2 className="mt-4 border-t border-zinc-200 pt-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
          Preferences
        </h2>

        <Row label="Sort by" htmlFor="adv-order">
          <select
            id="adv-order"
            name="order"
            defaultValue={params.order ?? ""}
            className={INPUT_CLASS}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Decklists per page" htmlFor="adv-page-size">
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
          <Link href="/decklists/advanced" className="text-sm underline">
            Reset
          </Link>
        </div>
      </form>
    </main>
  );
}
