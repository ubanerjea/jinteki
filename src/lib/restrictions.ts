// Pure "what's this card's current legality per format" computation for
// /cards/[code] (PHASE_6_PLAN.md item 9). Kept separate from the page
// component - like resolveRuleSectionIds.ts - so it's testable without a DB
// connection (everything it needs, `Card.raw`'s `format_ids`/`restrictions`
// and the already-fetched `Format` rows, is passed in as plain data).
//
// See prisma/schema.prisma's Format/Restriction model comment and
// agent-reports/phase-6.md for why this cross-references
// `Format.activeRestrictionId` against the per-card restriction-id-keyed
// history blob already embedded in `Card.raw` (`attributes.restrictions`),
// rather than a separate per-card join table: a card's `restrictions` field
// lists every restriction id that has ever banned/restricted/pointed it -
// checking whether that set contains a format's *currently active*
// restriction id is enough to determine current status, with no additional
// per-card sync needed.

import type { CardRestrictionsAttribute } from "@/lib/nrdb/types";

export type CardLegalityStatus =
  | "legal"
  | "banned"
  | "restricted"
  | "points"
  | "influence";

export interface CardLegalityEntry {
  formatId: string;
  formatName: string;
  status: CardLegalityStatus;
  points?: number;
  influenceCost?: number;
}

export interface FormatLike {
  id: string;
  name: string;
  activeRestrictionId: string | null;
}

const EMPTY_RESTRICTIONS: CardRestrictionsAttribute = {
  banned: [],
  restricted: [],
  points: {},
  universal_faction_cost: {},
  global_penalty: [],
};

/**
 * Computes this card's current legality status in every format it's a
 * member of (`formatIds`, from `Card.raw.attributes.format_ids`). Formats
 * the card isn't a member of at all are omitted, not marked "banned" - a
 * card that was never in a format's pool isn't "restricted" there, it's just
 * not applicable.
 */
export function computeCardLegality(
  formatIds: string[] | undefined,
  cardRestrictions: CardRestrictionsAttribute | undefined,
  formats: FormatLike[],
): CardLegalityEntry[] {
  const memberFormatIds = new Set(formatIds ?? []);
  const restrictions = cardRestrictions ?? EMPTY_RESTRICTIONS;

  return formats
    .filter((format) => memberFormatIds.has(format.id))
    .map((format) => {
      const activeId = format.activeRestrictionId;
      if (!activeId) {
        return { formatId: format.id, formatName: format.name, status: "legal" as const };
      }
      if (restrictions.banned.includes(activeId)) {
        return { formatId: format.id, formatName: format.name, status: "banned" as const };
      }
      if (restrictions.restricted.includes(activeId)) {
        return { formatId: format.id, formatName: format.name, status: "restricted" as const };
      }
      if (restrictions.points[activeId] != null) {
        return {
          formatId: format.id,
          formatName: format.name,
          status: "points" as const,
          points: restrictions.points[activeId],
        };
      }
      if (restrictions.universal_faction_cost[activeId] != null) {
        return {
          formatId: format.id,
          formatName: format.name,
          status: "influence" as const,
          influenceCost: restrictions.universal_faction_cost[activeId],
        };
      }
      return { formatId: format.id, formatName: format.name, status: "legal" as const };
    });
}

// A grouped legality display line - one per status, plus one per
// points/influence entry (those aren't grouped the way legal/banned/
// restricted are - see summarizeLegality below). Carries `formatId`
// alongside `formatName` (unlike the old string[] return shape, which
// joined names into one string and so lost the ability to link each name
// back to its format) so callers can render each entry as a real
// `/formats/{formatId}` link.
export interface LegalityLine {
  label: string; // e.g. "Legal in", "Banned in", "2 pts in", "+1 influence in"
  entries: { formatId: string; formatName: string }[];
}

/**
 * Groups legality entries into display lines, e.g.
 * { label: "Legal in", entries: [Standard, Startup] },
 * { label: "Banned in", entries: [Eternal] },
 * { label: "2 pts in", entries: [Eternal] }.
 * Omits a group entirely when nothing falls into it. Order is fixed
 * (legal, banned, restricted, points, influence) regardless of input order.
 * Points/influence entries are still one LegalityLine per entry (not
 * grouped with each other) since each carries its own point/influence
 * value in the label - same grouping behavior as the old string-based
 * version, just carrying formatId through instead of discarding it.
 */
export function summarizeLegality(entries: CardLegalityEntry[]): LegalityLine[] {
  const lines: LegalityLine[] = [];

  const toEntries = (es: CardLegalityEntry[]) =>
    es.map((e) => ({ formatId: e.formatId, formatName: e.formatName }));

  const legal = entries.filter((e) => e.status === "legal");
  if (legal.length > 0) {
    lines.push({ label: "Legal in", entries: toEntries(legal) });
  }

  const banned = entries.filter((e) => e.status === "banned");
  if (banned.length > 0) {
    lines.push({ label: "Banned in", entries: toEntries(banned) });
  }

  const restricted = entries.filter((e) => e.status === "restricted");
  if (restricted.length > 0) {
    lines.push({ label: "Restricted in", entries: toEntries(restricted) });
  }

  for (const entry of entries.filter((e) => e.status === "points")) {
    lines.push({
      label: `${entry.points} pt${entry.points === 1 ? "" : "s"} in`,
      entries: [{ formatId: entry.formatId, formatName: entry.formatName }],
    });
  }

  for (const entry of entries.filter((e) => e.status === "influence")) {
    lines.push({
      label: `+${entry.influenceCost} influence in`,
      entries: [{ formatId: entry.formatId, formatName: entry.formatName }],
    });
  }

  return lines;
}
