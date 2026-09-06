// Option lists for simple-search prefixes, shared by every page that
// renders a <SimpleSearchBox> (the home page, /cards, and the Simple
// search field at the top of /cards/advanced) and by /cards/advanced's
// own Faction / Type / Subtype pickers and Side select.
//
// These feed the type-ahead's dropdown *content* only - nothing here
// filters results. The prefix syntax requires the exact underlying code
// (`haas_bioroid`, not "Haas-Bioroid"), which is precisely why the box
// needs a list to complete from rather than asking people to memorize
// codes.
//
// Extracted so the three pages call one function instead of tripling the
// same queries.

import { Prisma } from "@prisma/client";

import type { FacetOption } from "@/components/facet-picker";
import { formatCode } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export interface PrefixOptions {
  faction: FacetOption[];
  type: FacetOption[];
  keyword: FacetOption[];
  side: FacetOption[];
  format: FacetOption[];
  pack: FacetOption[];
  cycle: FacetOption[];
  banned: FacetOption[];
}

const SIDE_CODES = ["corp", "runner"];
const BANNED_OPTIONS: FacetOption[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export async function getPrefixOptions(): Promise<PrefixOptions> {
  const [factions, typeRows, keywordRows, formats, packs, cycles] =
    await Promise.all([
      prisma.faction.findMany({
        orderBy: { code: "asc" },
        select: { code: true },
      }),
      prisma.card.groupBy({ by: ["typeCode"], orderBy: { typeCode: "asc" } }),
      prisma.$queryRaw<{ keyword: string }[]>(
        Prisma.sql`SELECT DISTINCT unnest(keywords) AS keyword FROM "Card" ORDER BY 1`,
      ),
      prisma.format.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.pack.findMany({
        orderBy: { name: "asc" },
        select: { code: true, name: true },
      }),
      prisma.cycle.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
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
    format: formats.map((f) => ({ value: f.id, label: f.name })),
    pack: packs.map((p) => ({ value: p.code, label: p.name })),
    cycle: cycles.map((c) => ({ value: c.id, label: c.name })),
    banned: BANNED_OPTIONS,
  };
}
