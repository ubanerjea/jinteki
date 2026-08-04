import Link from "next/link";

import { hrefWithOverrides, VIEWS, type View } from "@/components/card-results";
import { PAGE_SIZE_OPTIONS } from "@/lib/search/pagination";
import type { SearchParamsInput } from "@/lib/search/types";

// The Display / Sort / Per page cluster shared by /cards and
// /cards/advanced/results (PHASE_7_PLAN.md item 2), so the two results pages
// are identical by construction rather than by discipline.
//
// Rendered as plain links rather than <select>s: the advanced results page
// has no <form> around it (its filters live on /cards/advanced), and a
// <select> with no submit button needs client-side JS to do anything. Links
// keep every control working with JS off and keep the URL the single source
// of truth, matching the view toggle /cards has always used.

const VIEW_LABELS: Record<View, string> = {
  list: "List",
  grid: "Grid",
  checklist: "Checklist",
  names: "Names",
};

// Empty value = the default (relevance ranking when there's free text, else
// title) - same contract as ORDER_COLUMNS' fallback in cards.ts.
export const ORDER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Relevance" },
  { value: "title", label: "Title" },
  { value: "faction", label: "Faction" },
  { value: "type", label: "Type" },
];

// DEFAULT_PAGE_SIZE is 30 and MAX_PAGE_SIZE is 100 (src/lib/search/
// pagination.ts) - deliberately no option above the clamp, which would
// silently render as 100 anyway. The list itself now lives in pagination.ts
// so the card parsers can reject a `?pageSize=` outside it; re-exported here
// because this component is where callers expect to find it.
export { PAGE_SIZE_OPTIONS };

function ControlGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-500">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function ControlLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={
        active
          ? "font-semibold underline"
          : "text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200"
      }
    >
      {children}
    </Link>
  );
}

export function ResultsControls({
  basePath,
  searchParams,
  view,
  order,
  pageSize,
}: {
  basePath: string;
  searchParams: SearchParamsInput;
  view: View;
  order: string;
  pageSize: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
      <ControlGroup label="Display">
        {VIEWS.map((v) => (
          <ControlLink
            key={v}
            // Switching view is a pure rendering change over the same result
            // set, so `page` is deliberately preserved here (unlike sort and
            // per page below, which change what page N contains).
            href={hrefWithOverrides(basePath, searchParams, { view: v })}
            active={view === v}
          >
            {VIEW_LABELS[v]}
          </ControlLink>
        ))}
      </ControlGroup>

      <ControlGroup label="Sort">
        {ORDER_OPTIONS.map((o) => (
          <ControlLink
            key={o.value || "relevance"}
            href={hrefWithOverrides(basePath, searchParams, {
              order: o.value,
              page: "",
            })}
            active={order === o.value}
          >
            {o.label}
          </ControlLink>
        ))}
      </ControlGroup>

      <ControlGroup label="Per page">
        {PAGE_SIZE_OPTIONS.map((size) => (
          <ControlLink
            key={size}
            href={hrefWithOverrides(basePath, searchParams, {
              pageSize: String(size),
              page: "",
            })}
            active={pageSize === size}
          >
            {size}
          </ControlLink>
        ))}
      </ControlGroup>
    </div>
  );
}
