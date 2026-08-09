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
