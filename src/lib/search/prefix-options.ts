// Option lists for the four `f:`/`t:`/`s:`/`d:` prefixes, shared by every
// page that renders a <SimpleSearchBox> (the home page, /cards, and the
// Simple search field at the top of /cards/advanced) and by
// /cards/advanced's own Faction / Type / Subtype pickers and Side select.
//
// These feed the type-ahead's dropdown *content* only - nothing here filters
// results. The prefix syntax requires the exact underlying code
// (`haas_bioroid`, not "Haas-Bioroid"), which is precisely why the box needs
// a list to complete from rather than asking people to memorize codes.
//
// Extracted so the three pages call one function instead of tripling the
// same three queries. Cheap by design: ~12 factions, ~11 types, ~104
// keywords, and a static two-item side list.

import { Prisma } from "@prisma/client";

import type { FacetOption } from "@/components/facet-picker";
import { formatCode } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export interface PrefixOptions {
  faction: FacetOption[];
  type: FacetOption[];
  keyword: FacetOption[];
  side: FacetOption[];
}

// `Side` has no table of its own - the two values are fixed by the game, and
// /cards/advanced has always inlined them. Kept here so all four prefixes
// come from one place.
const SIDE_CODES = ["corp", "runner"];

export async function getPrefixOptions(): Promise<PrefixOptions> {
  const [factions, typeRows, keywordRows] = await Promise.all([
    prisma.faction.findMany({ orderBy: { code: "asc" }, select: { code: true } }),
    prisma.card.groupBy({ by: ["typeCode"], orderBy: { typeCode: "asc" } }),
    prisma.$queryRaw<{ keyword: string }[]>(
      Prisma.sql`SELECT DISTINCT unnest(keywords) AS keyword FROM "Card" ORDER BY 1`,
    ),
  ]);

  return {
    faction: factions.map((f) => ({ value: f.code, label: formatCode(f.code) })),
    type: typeRows.map((t) => ({
      value: t.typeCode,
      label: formatCode(t.typeCode),
    })),
    keyword: keywordRows.map((k) => ({
      value: k.keyword,
      label: formatCode(k.keyword),
    })),
    side: SIDE_CODES.map((code) => ({ value: code, label: formatCode(code) })),
  };
}
