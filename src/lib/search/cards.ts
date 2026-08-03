// Card list/search query layer for /cards. Used by the page component and
// by cards.test.ts - not duplicated inline in the page.
//
// Hard requirement (PHASE_4_PLAN.md "no raw-SQL injection risk"): the free-
// text trigram search needs `$queryRaw`/`Prisma.sql` since Prisma's normal
// query builder has no way to express the `%`/`similarity()` trigram
// operators. Every value that comes from user input (`q`, `faction`, `side`,
// `type`) is passed through a `Prisma.sql`/`Prisma.join` tagged-template
// fragment, which Prisma auto-parameterizes - never through
// `$queryRawUnsafe` or plain string concatenation/interpolation.

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  DEFAULT_PAGE_SIZE,
  pageOffset,
  parsePage,
  parsePageSize,
  toPagedResult,
} from "./pagination";
import { firstParam, type PagedResult, type SearchParamsInput } from "./types";

export interface CardSearchParams {
  q?: string;
  faction?: string;
  side?: string;
  type?: string;
  keyword?: string;
  pack?: string;
  format?: string;
  order?: string;
  page?: number | string;
  pageSize?: number | string;
}

// Item 6 (PHASE_6_PLAN.md): minimal `field:value` operator syntax inside the
// `q` box, e.g. "f:anarch s:virus rootkit". Maps NRDB's own f/t/s/d operand
// letters onto the CardSearchParams field each already has a dropdown for.
// Case-insensitive prefix letter; only these four exact prefixes are
// recognized - anything else (e.g. "x:foo") is left alone as literal query
// text, same "don't invent behavior for the unrecognized case" caution
// src/lib/card-text.tsx's tag parser uses.
const OPERATOR_FIELD: Record<string, keyof Pick<CardSearchParams, "faction" | "type" | "keyword" | "side">> = {
  f: "faction",
  t: "type",
  s: "keyword",
  d: "side",
};
const OPERATOR_TOKEN = /^(f|t|s|d):(\S+)$/i;

// Splits a raw `q` string into recognized operator tokens (folded into the
// corresponding field) and residual free text. Explicit dropdown values
// (already-set `faction`/`type`/`keyword`/`side`) always win over a
// same-field operator token in `q` - the operator syntax only fills in
// whatever the dropdown left blank (PHASE_6_PLAN.md's "Things to confirm"
// precedence rule: dropdown is the primary, discoverable UI; the operator
// syntax is a power-user shortcut layered on top, not a competing source of
// truth).
function extractOperators(
  q: string,
  explicit: Pick<CardSearchParams, "faction" | "type" | "keyword" | "side">,
): { residual: string; derived: Pick<CardSearchParams, "faction" | "type" | "keyword" | "side"> } {
  const derived: Pick<CardSearchParams, "faction" | "type" | "keyword" | "side"> = {};
  const residualTokens: string[] = [];

  for (const token of q.split(/\s+/).filter(Boolean)) {
    const match = token.match(OPERATOR_TOKEN);
    if (!match) {
      residualTokens.push(token);
      continue;
    }
    const field = OPERATOR_FIELD[match[1].toLowerCase()];
    const value = match[2];
    if (!explicit[field] && !derived[field]) {
      derived[field] = value;
    }
    // Recognized operator token is stripped from the residual text
    // regardless of whether it ended up being used (dropdown-wins case) -
    // it was still "consumed" as an operator, not left as free text.
  }

  return { residual: residualTokens.join(" "), derived };
}

// Explicit sort control (PHASE_5_PLAN.md, from the Scryfall UX research):
// values map 1:1 to a real column to ORDER BY. Anything else (including
// absent/blank, i.e. the <select>'s default option) falls back to the
// pre-existing behavior (similarity ranking when there's a `q`, else
// alphabetical by title) - additive, not a breaking change.
const ORDER_COLUMNS: Record<string, Prisma.Sql> = {
  title: Prisma.sql`title`,
  faction: Prisma.sql`"factionCode"`,
  type: Prisma.sql`"typeCode"`,
};

export interface CardSummary {
  code: string;
  title: string;
  typeCode: string;
  factionCode: string;
  sideCode: string;
  packCode: string | null;
  // Needed by the grid view's card-image cells (getCardImageUrl() reads
  // `raw.attributes...`, same as /cards/[code] - see PHASE_5_PLAN.md's
  // grid-view section). Selected here rather than a second query per row.
  raw: unknown;
}

// Parses a Next.js `searchParams` object (or any other string-keyed input)
// into typed, normalized CardSearchParams. Kept separate from searchCards()
// itself so the parsing logic (trimming, blank -> undefined, page-number
// coercion) is independently testable without a DB connection.
export function parseCardSearchParams(
  input: SearchParamsInput,
): Required<Pick<CardSearchParams, "page" | "pageSize">> &
  Pick<
    CardSearchParams,
    "q" | "faction" | "side" | "type" | "keyword" | "pack" | "format" | "order"
  > {
  const qRaw = firstParam(input, "q")?.trim();
  const explicitFaction = firstParam(input, "faction")?.trim();
  const explicitSide = firstParam(input, "side")?.trim();
  const explicitType = firstParam(input, "type")?.trim();
  const explicitKeyword = firstParam(input, "keyword")?.trim();
  const pack = firstParam(input, "pack")?.trim();
  const format = firstParam(input, "format")?.trim();
  const order = firstParam(input, "order")?.trim();

  // Item 6: fold any recognized f:/t:/s:/d: operator tokens out of `q` into
  // the matching field, before the usual blank -> undefined normalization -
  // explicit dropdown params (parsed above) always take precedence, per the
  // extractOperators() precedence rule.
  const { residual, derived } = qRaw
    ? extractOperators(qRaw, {
        faction: explicitFaction,
        type: explicitType,
        keyword: explicitKeyword,
        side: explicitSide,
      })
    : { residual: "", derived: {} };

  const q = residual.trim();
  const faction = explicitFaction || derived.faction;
  const side = explicitSide || derived.side;
  const type = explicitType || derived.type;
  const keyword = explicitKeyword || derived.keyword;

  return {
    q: q ? q : undefined,
    faction: faction ? faction : undefined,
    side: side ? side : undefined,
    type: type ? type : undefined,
    keyword: keyword ? keyword : undefined,
    pack: pack ? pack : undefined,
    format: format ? format : undefined,
    order: order && order in ORDER_COLUMNS ? order : undefined,
    page: parsePage(firstParam(input, "page")),
    pageSize: parsePageSize(firstParam(input, "pageSize")),
  };
}

export async function searchCards(
  params: CardSearchParams,
): Promise<PagedResult<CardSummary>> {
  const page = parsePage(params.page);
  const pageSize = parsePageSize(params.pageSize);
  const q = params.q?.trim() || undefined;

  const conditions: Prisma.Sql[] = [];
  if (params.faction) {
    conditions.push(Prisma.sql`"factionCode" = ${params.faction}`);
  }
  if (params.side) {
    conditions.push(Prisma.sql`"sideCode" = ${params.side}`);
  }
  if (params.type) {
    conditions.push(Prisma.sql`"typeCode" = ${params.type}`);
  }
  if (params.keyword) {
    // Array-containment check against `Card.keywords` (String[]) - mirrors
    // the existing faction/side/type equality-filter pattern exactly, per
    // PHASE_5_PLAN.md.
    conditions.push(Prisma.sql`${params.keyword} = ANY("keywords")`);
  }
  if (params.pack) {
    // Item 1 (PHASE_6_PLAN.md): identical equality-filter pattern to
    // faction/side/type above - no new pattern introduced.
    conditions.push(Prisma.sql`"packCode" = ${params.pack}`);
  }
  if (params.format) {
    // Option A (format-descriptions-links-and-search-plan.md §5): filter by
    // format *membership* ("is this card in format X's pool at all"), not
    // "currently legal in X" (Option B - materially harder, deferred). No
    // native Card.formatIds column exists - format_ids lives inside
    // Card.raw, so this is a JSONB containment check (`@>`) rather than the
    // `= ANY(...)` pattern the keyword filter above uses against a real
    // String[] column. `to_jsonb(...)` converts the bound parameter into the
    // JSONB-scalar shape `@>` needs, keeping it a properly Prisma-
    // parameterized value (never raw string concatenation, per this file's
    // header). Confirmed working and performant (13ms unindexed sequential
    // scan against the real 2054-row table) in the plan's §2b investigation.
    conditions.push(
      Prisma.sql`(raw->'attributes'->'format_ids') @> to_jsonb(${params.format}::text)`,
    );
  }
  if (q) {
    // `<%` is pg_trgm's word-similarity operator (true when
    // word_similarity(q, column) exceeds pg_trgm.word_similarity_threshold,
    // default 0.6) - the best-matching substring of the column against q,
    // instead of `%`/similarity()'s whole-column comparison, so a short
    // query isn't diluted by the rest of a long title/text. `ILIKE` is
    // OR'd in as a plain-substring safety net for anything word_similarity
    // still misses (e.g. very short queries) - measured as cheap even
    // unindexed at this table's size. See plans/SEARCH_MATCHING.md.
    const likeQ = `%${q}%`;
    conditions.push(
      Prisma.sql`(${q} <% title OR title ILIKE ${likeQ} OR ${q} <% text OR text ILIKE ${likeQ})`,
    );
  }

  const whereSql = conditions.length
    ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
    : Prisma.empty;

  // With no free-text query, order alphabetically (there's no similarity
  // score to rank by, and an unordered result set would paginate
  // unstably - see agent-reports/phase-2.md's decklist pagination bug for
  // why an explicit stable ORDER BY matters even for full lists).
  //
  // An explicit `order` (faction/type - "title" behaves the same as the
  // pre-existing default and so doesn't need its own branch) takes priority
  // over similarity ranking, since choosing an explicit sort column is a
  // deliberate override of "most relevant first".
  const explicitOrderColumn =
    params.order && params.order !== "title"
      ? ORDER_COLUMNS[params.order]
      : undefined;
  const orderSql = explicitOrderColumn
    ? Prisma.sql`ORDER BY ${explicitOrderColumn} ASC, title ASC`
    : q
      ? Prisma.sql`ORDER BY GREATEST(word_similarity(${q}, title), word_similarity(${q}, coalesce(text, ''))) DESC, title ASC`
      : Prisma.sql`ORDER BY title ASC`;

  const [items, totalRows] = await Promise.all([
    prisma.$queryRaw<CardSummary[]>(Prisma.sql`
      SELECT code, title, "typeCode", "factionCode", "sideCode", "packCode", raw
      FROM "Card"
      ${whereSql}
      ${orderSql}
      LIMIT ${pageSize} OFFSET ${pageOffset(page, pageSize)}
    `),
    prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS count FROM "Card" ${whereSql}
    `),
  ]);

  const total = Number(totalRows[0]?.count ?? BigInt(0));
  return toPagedResult(items, total, page, pageSize);
}

export { DEFAULT_PAGE_SIZE };
