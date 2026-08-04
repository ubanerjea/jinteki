import Link from "next/link";

import { CardReference } from "@/components/card-reference";
import { getCardImageUrl } from "@/lib/card-image";
import { formatCode } from "@/lib/format";
import type { CardSummary } from "@/lib/search/cards";
import type { SearchParamsInput } from "@/lib/search/types";

// Shared card-results rendering, extracted verbatim from /cards/page.tsx in
// Phase 7 so /cards and /cards/advanced/results are identical by
// construction rather than by discipline (PHASE_7_PLAN.md item 2). Pure
// refactor - the four view branches below are the same markup /cards has
// rendered since Phase 6 item 5, moved, not rewritten.

// Item 5 (PHASE_6_PLAN.md): two more view modes beyond the existing
// list/grid toggle - "checklist" (denser one-row-per-card) and "names"
// (linked titles only, no metadata). Deliberately not chasing NRDB's full
// six "View as" modes - see PHASE_6_PLAN.md item 5's reasoning.
export type View = "list" | "grid" | "checklist" | "names";
export const VIEWS: View[] = ["list", "grid", "checklist", "names"];

export function parseView(input: SearchParamsInput): View {
  const raw = input.view;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (VIEWS as string[]).includes(value ?? "") ? (value as View) : "list";
}

// Builds an href that preserves every current search param except the ones
// being overridden - same "URL is the source of truth" approach as
// PaginationNav's hrefForPage, used here for the list/grid view toggle
// links (a rendering-mode switch on data already fetched, per
// PHASE_5_PLAN.md - no new query).
//
// An override with an empty-string value *removes* that key rather than
// setting it, which is how the sort/page-size controls drop a now-stale
// `page` (and how "Relevance" clears an explicit `order`).
export function hrefWithOverrides(
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

export function CardResultsList({
  items,
  view,
}: {
  items: CardSummary[];
  view: View;
}) {
  if (view === "names") {
    // Item 5: maximum-density mode - just linked titles, no metadata at
    // all, wrapped in a flex layout (closest analog to NRDB's own
    // "Names only" mode).
    return (
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
    );
  }

  if (view === "checklist") {
    // Item 5: denser than `list` - tighter vertical rhythm (py-0.5 vs
    // py-2), title + a single compact abbreviated stat summary instead
    // of separate spans. Good for scanning a whole pack once item 1's
    // pack filter narrows the list down.
    return (
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
    );
  }

  if (view === "list") {
    return (
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
    );
  }

  return (
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
  );
}
