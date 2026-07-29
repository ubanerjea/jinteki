import Link from "next/link";

import type { SearchParamsInput } from "@/lib/search/types";

// Plain server-rendered Previous/Next pagination - no client JS. Preserves
// every other current search param (q, faction, side, type, identity, ...)
// when linking to an adjacent page, since page state lives entirely in the
// URL per PHASE_4_PLAN.md's "searchParams drive state" requirement.
export function PaginationNav({
  basePath,
  searchParams,
  page,
  totalPages,
}: {
  basePath: string;
  searchParams: SearchParamsInput;
  page: number;
  totalPages: number;
}) {
  function hrefForPage(target: number): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === "page" || value === undefined) continue;
      if (Array.isArray(value)) {
        for (const v of value) params.append(key, v);
      } else {
        params.set(key, value);
      }
    }
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <nav aria-label="Pagination" className="flex items-center gap-4 text-sm">
      <span>
        Page {page} of {totalPages}
      </span>
      {page > 1 ? (
        <Link href={hrefForPage(page - 1)} className="underline">
          Previous
        </Link>
      ) : (
        <span className="text-zinc-400">Previous</span>
      )}
      {page < totalPages ? (
        <Link href={hrefForPage(page + 1)} className="underline">
          Next
        </Link>
      ) : (
        <span className="text-zinc-400">Next</span>
      )}
    </nav>
  );
}
