// "Which cards are currently banned/restricted/pointed in format X" -
// format-descriptions-links-and-search-plan.md §4c's stretch goal. Genuinely
// new query code (confirmed in that plan's §2c: no existing function answers
// this today), but the underlying data needs no new sync - a Restriction's
// `raw.attributes.verdicts` is already keyed by card *code* (confirmed live:
// `jsonb_object_keys(raw->'attributes'->'verdicts'->'points')` returns real
// Card.code values like "ddos", "sifr").
//
// Deliberately takes the format's `activeRestrictionId` directly rather than
// a `formatId` + doing its own Format lookup: every caller (currently just
// /formats/[id]/page.tsx) has already fetched the Format row for its own
// name/description/404 handling, so a second lookup here would be a
// redundant round trip.

import type { RestrictionVerdicts } from "@/lib/nrdb/types";
import { prisma } from "@/lib/prisma";

export interface FormatCardStatusEntry {
  code: string;
  title: string;
  points?: number;
}

export interface FormatCardStatus {
  banned: FormatCardStatusEntry[];
  restricted: FormatCardStatusEntry[];
  points: FormatCardStatusEntry[];
}

const EMPTY_STATUS: FormatCardStatus = { banned: [], restricted: [], points: [] };

/**
 * Looks up the given restriction's banned/restricted/points verdicts and
 * resolves each card code to its title. `activeRestrictionId` is null for
 * formats with no ban list at all (`ram`, `system_gateway`, per the plan's
 * background) - returns all-empty groups in that case, not an error.
 */
export async function getFormatCardStatus(
  activeRestrictionId: string | null,
): Promise<FormatCardStatus> {
  if (!activeRestrictionId) {
    return EMPTY_STATUS;
  }

  const restriction = await prisma.restriction.findUnique({
    where: { id: activeRestrictionId },
  });
  if (!restriction) {
    return EMPTY_STATUS;
  }

  const verdicts = (
    restriction.raw as { attributes?: { verdicts?: RestrictionVerdicts } }
  ).attributes?.verdicts;
  if (!verdicts) {
    return EMPTY_STATUS;
  }

  const bannedCodes = verdicts.banned ?? [];
  const restrictedCodes = verdicts.restricted ?? [];
  const pointsEntries = Object.entries(verdicts.points ?? {});
  const pointsCodes = pointsEntries.map(([code]) => code);

  const allCodes = Array.from(
    new Set([...bannedCodes, ...restrictedCodes, ...pointsCodes]),
  );
  const cards = await prisma.card.findMany({
    where: { code: { in: allCodes } },
    select: { code: true, title: true },
  });
  const titleByCode = new Map(cards.map((c) => [c.code, c.title]));

  const byTitle = (a: { title: string }, b: { title: string }) =>
    a.title.localeCompare(b.title);

  return {
    banned: bannedCodes
      .map((code) => ({ code, title: titleByCode.get(code) ?? code }))
      .sort(byTitle),
    restricted: restrictedCodes
      .map((code) => ({ code, title: titleByCode.get(code) ?? code }))
      .sort(byTitle),
    points: pointsEntries
      .map(([code, points]) => ({ code, title: titleByCode.get(code) ?? code, points }))
      .sort(byTitle),
  };
}
