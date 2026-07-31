import Link from "next/link";

import { formatCode } from "@/lib/format";

// Clickable facet link ("browse by facet", per the Scryfall UX research
// folded into PHASE_5_PLAN.md): turns a card's faction/type/side/keyword
// value into a link to the matching /cards filter instead of inert text.
// Used both directly on /cards/[code] and inside the CardReference popover
// so both places share one implementation.
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
      href={`/cards?${param}=${encodeURIComponent(value)}`}
      className={className ?? "underline decoration-dotted hover:decoration-solid"}
    >
      {formatCode(value)}
    </Link>
  );
}
