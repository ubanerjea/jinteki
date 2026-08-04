import Link from "next/link";

import { formatCode } from "@/lib/format";

// Clickable facet link ("browse by facet", per the Scryfall UX research
// folded into PHASE_5_PLAN.md): turns a card's faction/type/side/keyword
// value into a link to the matching card filter instead of inert text.
// Used both directly on /cards/[code] and inside the CardReference popover
// so both places share one implementation.
//
// Targets /cards/advanced rather than /cards since Phase 7: a "browse by
// facet" click should land where the filter is visible and editable, and
// /cards no longer has the widgets to change it.
const PARAM_BY_KIND = {
  faction: "faction",
  type: "type",
  side: "side",
  keyword: "keyword",
} as const;

export function FacetLink({
  kind,
  value,
  className,
}: {
  kind: keyof typeof PARAM_BY_KIND;
  value: string;
  className?: string;
}) {
  const param = PARAM_BY_KIND[kind];
  return (
    <Link
      href={`/cards/advanced?${param}=${encodeURIComponent(value)}`}
      className={className ?? "underline decoration-dotted hover:decoration-solid"}
    >
      {formatCode(value)}
    </Link>
  );
}
