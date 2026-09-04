// Query layer for /decklists/advanced and /decklists/advanced/results
// (PHASE_8_PLAN.md item 3).
//
// A **separate engine** from the quick-view tab queries in decklists.ts, for
// the same reason cards-advanced.ts is separate from searchCards(): the
// semantics genuinely differ - multi-criterion AND here vs. a fixed per-tab
// sort there - kept apart so neither can regress the other.
//
// Same raw-SQL rule as cards.ts: every user value goes through a
// `Prisma.sql`/`Prisma.join` tagged template, which Prisma auto-
// parameterizes - never `$queryRawUnsafe`, never string concatenation.

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { likePattern } from "./cards";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  pageOffset,
  parsePage,
  parsePageSize,
  toPagedResult,
} from "./pagination";
import {
  allParams,
  firstParam,
  type PagedResult,
  type SearchParamsInput,
} from "./types";

export interface AdvancedDecklistSearchParams {
  name?: string;
  fuzzy?: boolean;
  identity?: string;
  faction?: string[];
  side?: string;
  pack?: string[];
  cardsUsed?: string[];
  cardsExcluded?: string[];
  authorId?: string;
  // Card-pool-membership Format filter (addendum, 2026-08-08) - "is every
  // card in this deck (including the identity) a member of Format X's card
  // pool," NOT true MWL/legality checking. Single-valued, matching
  // /cards/advanced's own Format field (not a multi-picker).
  format?: string;
  // Rotation filter (PHASE_10_PLAN.md §3) - a single CardPool id (only ever
  // one of Standard's seven numbered rotations, e.g. "rotation_2025"),
  // mirroring NRDB classic-site's `rotation_id` dropdown. "Is every card in
  // this deck a member of this specific card pool" - computed entirely from
  // jinteki's own synced data (see decklist-legality.ts), since NRDB's own
  // `filter[rotation_id]` 500s and isn't documented/supported.
  rotation?: string;
  // Tournament Legal filter (PHASE_10_PLAN.md §3) - "1" (Yes) | "0" (No) |
  // unset (Ignore), mirroring NRDB classic-site's `is_legal` dropdown. Only
  // meaningful together with `format` (there's no per-decklist format field
  // to evaluate against otherwise) - a no-op if format isn't also set. The
  // narrower ban-list-verdict + pool-membership question only, per the plan -
  // NOT true points-budget MWL legality (still deferred).
  tournamentLegal?: string;
  order?: string; // "name" | "date" - nothing engagement-based, ever
  page?: number | string;
  pageSize?: number | string;
}

export interface ParsedAdvancedDecklistSearchParams
  extends AdvancedDecklistSearchParams {
  fuzzy: boolean;
  faction: string[];
  pack: string[];
  cardsUsed: string[];
  cardsExcluded: string[];
  page: number;
  pageSize: number;
}

const ORDER_VALUES = new Set(["name", "date"]);

// A plain own-property-style Set membership check - no ORDER_COLUMNS-style
// prototype-pollution hazard here since order is only ever compared against
// a fixed literal set, never used to look up a value on an object (unlike
// cards.ts' orderColumn(), which indexes a Record).
function validOrder(order: string | undefined): string | undefined {
  return order && ORDER_VALUES.has(order) ? order : undefined;
}

// Ignore/Yes/No, matching NRDB classic-site's own `is_legal` dropdown shape -
// only "1"/"0" are meaningful values, anything else (blank, garbage) means
// "Ignore" (the filter is skipped entirely), same pattern validOrder uses.
function validTournamentLegal(value: string | undefined): "1" | "0" | undefined {
  return value === "1" || value === "0" ? value : undefined;
}

// Parses a Next.js `searchParams` object into typed
// AdvancedDecklistSearchParams. Kept separate from searchDecklistsAdvanced()
// so the parsing (multi-value facet collection, normalization) is testable
// without a DB connection, mirroring parseAdvancedCardSearchParams()'s shape
// exactly.
export function parseAdvancedDecklistSearchParams(
  input: SearchParamsInput,
): ParsedAdvancedDecklistSearchParams {
  const nameRaw = firstParam(input, "name")?.trim();
  const order = firstParam(input, "order")?.trim();
  const identity = firstParam(input, "identity")?.trim();
  const side = firstParam(input, "side")?.trim();
  const authorId = firstParam(input, "authorId")?.trim();
  const format = firstParam(input, "format")?.trim();
  const rotation = firstParam(input, "rotation")?.trim();
  const tournamentLegal = validTournamentLegal(
    firstParam(input, "tournamentLegal")?.trim(),
  );

  const faction = allParams(input, "faction");
  const pack = allParams(input, "pack");
  const cardsUsed = allParams(input, "cardsUsed");
  const cardsExcluded = allParams(input, "cardsExcluded");

  return {
    name: nameRaw ? nameRaw : undefined,
    fuzzy: firstParam(input, "fuzzy") === "1",
    identity: identity ? identity : undefined,
    faction,
    side: side ? side : undefined,
    pack,
    cardsUsed,
    cardsExcluded,
    authorId: authorId ? authorId : undefined,
    format: format ? format : undefined,
    rotation: rotation ? rotation : undefined,
    tournamentLegal,
    order: validOrder(order),
    page: parsePage(firstParam(input, "page")),
    pageSize: parsePageSize(
      firstParam(input, "pageSize"),
      DEFAULT_PAGE_SIZE,
      PAGE_SIZE_OPTIONS,
    ),
  };
}

// One text field's WHERE condition - identical shape to cards-advanced.ts'
// private textCondition(), reimplemented here (not imported) because that
// one is module-private to cards-advanced.ts; only likePattern() is exported
// and reused directly, per PHASE_8_PLAN.md item 3's explicit instruction.
function nameCondition(term: string, fuzzy: boolean): Prisma.Sql {
  const like = likePattern(term);
  return fuzzy
    ? Prisma.sql`(d.name ILIKE ${like} OR ${term} <% d.name)`
    : Prisma.sql`d.name ILIKE ${like}`;
}

export interface DecklistAdvancedSummary {
  id: string;
  name: string;
  identityCode: string;
  identityTitle: string;
  createdAt: Date | null;
}

export async function searchDecklistsAdvanced(
  params: AdvancedDecklistSearchParams,
): Promise<PagedResult<DecklistAdvancedSummary>> {
  const page = parsePage(params.page);
  const pageSize = parsePageSize(params.pageSize);
  const name = params.name?.trim() || undefined;
  const fuzzy = params.fuzzy === true;

  const conditions: Prisma.Sql[] = [];

  if (name) {
    conditions.push(nameCondition(name, fuzzy));
  }

  if (params.identity) {
    conditions.push(Prisma.sql`d."identityCode" = ${params.identity}`);
  }

  const faction = (params.faction ?? []).map((v) => v.trim()).filter(Boolean);
  if (faction.length === 1) {
    conditions.push(Prisma.sql`c."factionCode" = ${faction[0]}`);
  } else if (faction.length > 1) {
    conditions.push(Prisma.sql`c."factionCode" = ANY(${faction})`);
  }

  if (params.side) {
    conditions.push(Prisma.sql`c."sideCode" = ${params.side}`);
  }

  // "Deck contains at least one card from any of the selected packs" - a
  // deliberate, reasonable interpretation for a *browsing* feature, not a
  // confirmed match to NRDB's own `packs[]` semantics (that could not be
  // confirmed from the research evidence - see PHASE_8_PLAN.md item 3 and
  // agent-reports/decklist-search-quickviews-research.md §1). Flagged
  // explicitly in the task report, not silently assumed.
  const pack = (params.pack ?? []).map((v) => v.trim()).filter(Boolean);
  if (pack.length > 0) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "DecklistCard" dc
      JOIN "Card" cc ON cc.code = dc."cardCode"
      WHERE dc."decklistId" = d.id AND cc."packCode" = ANY(${pack})
    )`);
  }

  // "Containing ALL supplied Card ids" - one EXISTS condition per selected
  // card, ANDed together (per the real API docs' own literal endpoint name,
  // agent-reports/decklist-search-quickviews-research.md §3). Each lookup
  // hits DecklistCard's existing @@id([decklistId, cardCode]) composite
  // primary key directly - no new index needed.
  const cardsUsed = (params.cardsUsed ?? []).map((v) => v.trim()).filter(Boolean);
  for (const code of cardsUsed) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "DecklistCard" dc
      WHERE dc."decklistId" = d.id AND dc."cardCode" = ${code}
    )`);
  }

  // "Excluding ALL supplied Card ids" - mirror image, one NOT EXISTS
  // condition per selected card, ANDed.
  const cardsExcluded = (params.cardsExcluded ?? [])
    .map((v) => v.trim())
    .filter(Boolean);
  for (const code of cardsExcluded) {
    conditions.push(Prisma.sql`NOT EXISTS (
      SELECT 1 FROM "DecklistCard" dc
      WHERE dc."decklistId" = d.id AND dc."cardCode" = ${code}
    )`);
  }

  if (params.authorId) {
    conditions.push(Prisma.sql`d."nrdbUserId" = ${params.authorId}`);
  }

  // Card-pool-membership Format filter (addendum, 2026-08-08): "is every
  // card in this deck a member of Format X's current card pool" - NOT
  // legality (a card can be pool-member and still banned/pointed under the
  // active Restriction; this says nothing about that, same honest
  // limitation /cards/advanced's own Format row states in its hint).
  // Reuses the exact same format_ids JSONB-containment check cards.ts'
  // buildFacetConditions() uses for its own `format` facet, against every
  // card in the deck - a fourth instance of this phase's per-card
  // EXISTS/NOT EXISTS-over-DecklistCard shape (pack, cardsUsed,
  // cardsExcluded, now this), not new infrastructure. Deliberately includes
  // the identity too (DecklistCard rows cover every card slot including the
  // identity, per Phase 4's finding that NRDB's card_slots includes it) -
  // a deck whose identity isn't in the format's pool isn't a member of that
  // format either.
  if (params.format) {
    conditions.push(Prisma.sql`
      NOT EXISTS (
        SELECT 1 FROM "DecklistCard" dc
        JOIN "Card" cc ON cc.code = dc."cardCode"
        WHERE dc."decklistId" = d.id
          AND NOT ((cc.raw->'attributes'->'format_ids') @> to_jsonb(${params.format}::text))
      )
    `);
  }

  // Rotation filter (PHASE_10_PLAN.md §3): "is every card in this deck a
  // member of this specific card pool" - checked via each card's own
  // `card_pool_ids` (Card.raw.attributes.card_pool_ids), NRDB's own
  // precomputed per-card pool-membership history. See decklist-legality.ts's
  // header comment for why this reads card_pool_ids directly rather than
  // deriving membership from CardPool.cardCycleIds (the plan's literal
  // wording) - a deliberate, documented deviation. Same NOT EXISTS-over-
  // DecklistCard shape as every other per-card facet in this file.
  if (params.rotation) {
    conditions.push(Prisma.sql`
      NOT EXISTS (
        SELECT 1 FROM "DecklistCard" dc
        JOIN "Card" cc ON cc.code = dc."cardCode"
        WHERE dc."decklistId" = d.id
          AND NOT ((cc.raw->'attributes'->'card_pool_ids') @> to_jsonb(${params.rotation}::text))
      )
    `);
  }

  // Tournament Legal filter (PHASE_10_PLAN.md §3): only meaningful together
  // with `format` (there's no per-decklist format field to evaluate
  // against otherwise) - a silent no-op if format isn't also set, same
  // "nothing to check against" reasoning as every other conditional facet
  // here. Computes the SAME narrow definition decklist-legality.ts's
  // isDecklistTournamentLegal() pure function does (not banned under the
  // format's active restriction AND a member of its active card pool) via
  // one EXISTS-for-any-illegal-card query instead of fetching every card
  // into JS - real DB-side evaluation across 74k+ decklists, not a
  // per-request re-derivation of the pure function.
  if (params.tournamentLegal && params.format) {
    const activeFormat = await prisma.format.findUnique({
      where: { id: params.format },
      select: { activeRestrictionId: true, activeCardPoolId: true },
    });
    if (activeFormat && (activeFormat.activeRestrictionId || activeFormat.activeCardPoolId)) {
      const banCondition = activeFormat.activeRestrictionId
        ? Prisma.sql`(cc.raw->'attributes'->'restrictions'->'banned') @> to_jsonb(${activeFormat.activeRestrictionId}::text)`
        : Prisma.sql`false`;
      const poolCondition = activeFormat.activeCardPoolId
        ? Prisma.sql`NOT ((cc.raw->'attributes'->'card_pool_ids') @> to_jsonb(${activeFormat.activeCardPoolId}::text))`
        : Prisma.sql`false`;
      const hasIllegalCard = Prisma.sql`
        EXISTS (
          SELECT 1 FROM "DecklistCard" dc
          JOIN "Card" cc ON cc.code = dc."cardCode"
          WHERE dc."decklistId" = d.id
            AND (${banCondition} OR ${poolCondition})
        )
      `;
      conditions.push(
        params.tournamentLegal === "1"
          ? Prisma.sql`NOT (${hasIllegalCard})`
          : hasIllegalCard,
      );
    }
  }

  const whereSql = conditions.length
    ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
    : Prisma.empty;

  const order = validOrder(params.order);
  const relevanceTerm =
    fuzzy && name ? Prisma.sql`word_similarity(${name}, d.name)` : undefined;

  // order=name -> name ASC; order=date -> date DESC, name ASC (tie-break);
  // no order and no name filter -> name ASC; no order with fuzzy name search
  // on -> relevance-ranking fallback, same as cards-advanced.ts. No
  // Popularity/Likes/Reputation option exists anywhere in this parser -
  // genuinely absent, per PHASE_8_PLAN.md's Divergence section.
  const orderSql =
    order === "date"
      ? Prisma.sql`ORDER BY d."createdAt" DESC NULLS LAST, d.name ASC`
      : order === "name"
        ? Prisma.sql`ORDER BY d.name ASC`
        : relevanceTerm
          ? Prisma.sql`ORDER BY ${relevanceTerm} DESC, d.name ASC`
          : Prisma.sql`ORDER BY d.name ASC`;

  const [items, totalRows] = await Promise.all([
    prisma.$queryRaw<DecklistAdvancedSummary[]>(Prisma.sql`
      SELECT d.id, d.name, d."identityCode" AS "identityCode",
             c.title AS "identityTitle", d."createdAt"
      FROM "Decklist" d
      JOIN "Card" c ON c.code = d."identityCode"
      ${whereSql}
      ${orderSql}
      LIMIT ${pageSize} OFFSET ${pageOffset(page, pageSize)}
    `),
    prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS count
      FROM "Decklist" d
      JOIN "Card" c ON c.code = d."identityCode"
      ${whereSql}
    `),
  ]);

  const total = Number(totalRows[0]?.count ?? BigInt(0));
  return toPagedResult(items, total, page, pageSize);
}
