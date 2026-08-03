import Link from "next/link";

// Sibling to FacetLink (src/components/facet-link.tsx), not an extension of
// it: FacetLink's PARAM_BY_KIND map exists to turn a raw lowercase/underscore
// code into a `/cards?{param}={value}` filter link, labeled via
// formatCode(value). A format link needs a materially different shape on
// both ends - it points at a *detail page* (`/formats/{formatId}`), not a
// /cards filter, and its label is already the format's real human-readable
// `name` (e.g. "Random Access Memories"), not something to derive via
// formatCode() from a raw id like "ram". Folding this into FacetLink's
// PARAM_BY_KIND map would mean special-casing away most of what that map is
// for, so it's a small sibling component instead - used by
// src/app/cards/[code]/page.tsx to render summarizeLegality()'s
// LegalityLine entries as real links.
export function FormatLink({
  formatId,
  formatName,
  className,
}: {
  formatId: string;
  formatName: string;
  className?: string;
}) {
  return (
    <Link
      href={`/formats/${formatId}`}
      className={className ?? "underline decoration-dotted hover:decoration-solid"}
    >
      {formatName}
    </Link>
  );
}
