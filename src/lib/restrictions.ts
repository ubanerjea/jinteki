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
// --- Restriction-history display (PHASE_10_PLAN.md §1) --------------------
//
// /formats/[id]'s restriction-history list previously rendered every
// Restriction row matching a format with only a single isActive check,
// conflating four different things: real past history, the active entry,
// real future/staged entries NSG has scheduled but not yet flipped active,
// and unrelated "NRDB Classic" legacy bookkeeping entries (name suffix
// "(ignore active date)") that shouldn't appear in a live format's history
// view at all. Root cause confirmed against primary sources (NSG's
// netrunner-cards-json, NRDB's nrdbv2 frontend source) - see
// plans/archive/FORMATS_SECTION_FIXES_PLAN.md's Fix 1 Background and
// PHASE_10_PLAN.md §1: `active_restriction_id` is a hand-set editorial flag,
// not date-derived, and "(ignore active date)" is NRDB's own documented
// signal for legacy classic-site-only bookkeeping rows. jinteki's sync
// already mirrors the flag correctly - this is purely a display fix.

export type RestrictionHistoryStatus = "active" | "scheduled" | "past";

export interface RestrictionLike {
  id: string;
  name: string;
  dateStart: Date | null;
}

export interface RestrictionHistoryEntry {
  restriction: RestrictionLike;
  status: RestrictionHistoryStatus;
}

const LEGACY_NAME_SUFFIX = " (ignore active date)";

/**
 * Classifies a format's restriction history into active/scheduled/past,
 * excluding NRDB's legacy "(ignore active date)" bookkeeping rows entirely.
 *
 * Classification compares each restriction's `dateStart` against the
 * *active* restriction's `dateStart` (matched via `format.activeRestrictionId`)
 * - not against wall-clock "today". NSG flips the active flag manually and it
 * can lag real time (a scheduled entry's date_start can already be in the
 * past relative to today while still not being the flipped-active entry) -
 * confirmed live 2026-09-04: standard's active entry is
 * `standard_ban_list_26_03` (date_start 2026-03-13) even though
 * `standard_ban_list_26_05` (2026-05-01) and `standard_balance_update_26_08`
 * (2026-08-01) - both real, later-dated entries - already exist in the same
 * history.
 *
 * Preserves the input's ordering (callers pass restrictions already sorted
 * newest-first by dateStart, matching /formats/[id]'s existing query) - this
 * function doesn't re-sort.
 */
export function partitionRestrictionHistory(
  history: RestrictionHistoryEntry[],
): {
  current: RestrictionHistoryEntry[];
  past: RestrictionHistoryEntry[];
} {
  return {
    current: history.filter((entry) => entry.status !== "past"),
    past: history.filter((entry) => entry.status === "past"),
  };
}

export function classifyRestrictionHistory(
  format: FormatLike,
  restrictions: RestrictionLike[],
): RestrictionHistoryEntry[] {
  const visible = restrictions.filter(
    (r) => !r.name.endsWith(LEGACY_NAME_SUFFIX),
  );

  const activeId = format.activeRestrictionId;
  const active = activeId ? visible.find((r) => r.id === activeId) : undefined;
  const activeDateStart = active?.dateStart ?? null;

  return visible.map((restriction) => {
    if (activeId && restriction.id === activeId) {
      return { restriction, status: "active" as const };
    }
    if (
      activeDateStart &&
      restriction.dateStart &&
      restriction.dateStart.getTime() > activeDateStart.getTime()
    ) {
      return { restriction, status: "scheduled" as const };
    }
    return { restriction, status: "past" as const };
  });
}

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
