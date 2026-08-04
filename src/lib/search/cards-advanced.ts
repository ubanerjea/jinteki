// Query layer for /cards/advanced and /cards/advanced/results.
//
// A **separate engine** from searchCards(), not a branch inside it
// (PHASE_7_PLAN.md item 4). The semantics genuinely differ:
//
//   - /cards ORs one merged query across title *and* text; here `title` and
//     `text` are two independent fields ANDed together, because splitting
//     the box into two only makes sense if each one narrows.
//   - /cards always ORs pg_trgm's `<%` word-similarity operator in alongside
//     ILIKE (plans/SEARCH_MATCHING.md). Here fuzziness is **opt-in**: with
//     the checkbox off the query is a plain ILIKE substring match and
//     contains no word_similarity/`<%` at all. That is the whole point of
//     the advanced page - a precise search must be able to turn typo
//     tolerance off - and it means advanced can legitimately return *fewer*
//     rows than simple for the same input.
//
// Keeping the two apart means the shipped, tested simple path carries zero
// regression risk from anything in here.
//
// Same raw-SQL rule as cards.ts: every user value goes through a
// `Prisma.sql`/`Prisma.join` tagged template, which Prisma auto-
// parameterizes - never `$queryRawUnsafe`, never string concatenation.

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  buildFacetConditions,
  extractOperators,
  likePattern,
  orderColumn,
  type CardSummary,
} from "./cards";
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

export interface AdvancedCardSearchParams {
  title?: string;
  text?: string;
  fuzzy?: boolean;
  faction?: string[];
  side?: string;
  type?: string[];
  keyword?: string[];
  pack?: string[];
  format?: string;
  order?: string;
  page?: number | string;
  pageSize?: number | string;
}

export interface ParsedAdvancedCardSearchParams extends AdvancedCardSearchParams {
  fuzzy: boolean;
  faction: string[];
  type: string[];
  keyword: string[];
  pack: string[];
  page: number;
  pageSize: number;
}

// Parses a Next.js `searchParams` object into typed AdvancedCardSearchParams.
// Kept separate from searchCardsAdvanced() so the parsing (multi-value facet
// collection, prefix-token folding, precedence) is testable without a DB
// connection, same split cards.ts uses.
export function parseAdvancedCardSearchParams(
  input: SearchParamsInput,
): ParsedAdvancedCardSearchParams {
  const titleRaw = firstParam(input, "title")?.trim();
  const textRaw = firstParam(input, "text")?.trim();
  const order = firstParam(input, "order")?.trim();
  const format = firstParam(input, "format")?.trim();

  // Explicit picker/dropdown values, read before any token folding - these
  // always win (PHASE_6_PLAN.md item 6's precedence rule, unchanged).
  const faction = allParams(input, "faction");
  const type = allParams(input, "type");
  const keyword = allParams(input, "keyword");
  const pack = allParams(input, "pack");
  let side = firstParam(input, "side")?.trim() || undefined;

  // Both text fields independently run through the same extractOperators()
  // the `q` box uses, folding f:/t:/s:/d: tokens into the matching facet and
  // stripping them from the residual text. `title` is folded first, so when
  // both boxes carry a token for the same field title's wins - arbitrary but
  // deterministic, and documented on /cards/syntax.
  function fold(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    const { residual, derived } = extractOperators(raw, {
      // extractOperators treats a non-empty value as "already explicitly
      // set, don't override" - a non-empty array is exactly that.
      faction: faction[0],
      type: type[0],
      keyword: keyword[0],
      side,
    });
    if (derived.faction) faction.push(derived.faction);
    if (derived.type) type.push(derived.type);
    if (derived.keyword) keyword.push(derived.keyword);
    if (derived.side) side = derived.side;
    const trimmed = residual.trim();
    return trimmed ? trimmed : undefined;
  }

  const title = fold(titleRaw);
  const text = fold(textRaw);

  return {
    title,
    text,
    fuzzy: firstParam(input, "fuzzy") === "1",
    faction,
    side,
    type,
    keyword,
    pack,
    format: format ? format : undefined,
    // orderColumn() is an own-property lookup: `order=constructor` /
    // `__proto__` used to pass an `in` check and then bind a JS function as
    // a parameter (see cards.ts).
    order: orderColumn(order) ? order : undefined,
    page: parsePage(firstParam(input, "page")),
    // Restricted to the set the "Cards per page" <select> offers, so the
    // form cannot render a value it has no option for (ADVANCED_CARD_
    // SEARCH_PLAN.md: `pageSize` ∈ {30, 60, 100}).
    pageSize: parsePageSize(
      firstParam(input, "pageSize"),
      DEFAULT_PAGE_SIZE,
      PAGE_SIZE_OPTIONS,
    ),
  };
}

// One text field's WHERE condition. Fuzzy off is deliberately *only*
// `ILIKE` - no word_similarity, no `<%` anywhere in the emitted SQL.
//
// The term goes through likePattern(), which escapes `%`/`_`/`\` so they are
// matched literally: /cards/syntax promises "plain, case-insensitive
// substring matches", and before this `?title=%` returned all 2054 cards.
function textCondition(
  column: Prisma.Sql,
  term: string,
  fuzzy: boolean,
): Prisma.Sql {
  const like = likePattern(term);
  return fuzzy
    ? Prisma.sql`(${column} ILIKE ${like} OR ${term} <% ${column})`
    : Prisma.sql`${column} ILIKE ${like}`;
}

export async function searchCardsAdvanced(
  params: AdvancedCardSearchParams,
): Promise<PagedResult<CardSummary>> {
  const page = parsePage(params.page);
  const pageSize = parsePageSize(params.pageSize);
  const title = params.title?.trim() || undefined;
  const text = params.text?.trim() || undefined;
  const fuzzy = params.fuzzy === true;

  const conditions = buildFacetConditions(params);
  if (title) {
    conditions.push(textCondition(Prisma.sql`title`, title, fuzzy));
  }
  if (text) {
    conditions.push(textCondition(Prisma.sql`text`, text, fuzzy));
  }

  const whereSql = conditions.length
    ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
    : Prisma.empty;

  // Ordering: an explicit sort column always wins. Otherwise, if fuzzy
  // matching is on and there's something to rank by, rank by the best
  // word_similarity across whichever text fields were filled. Otherwise
  // alphabetical - with fuzzy off there is no similarity score to rank by
  // (every ILIKE hit is equally a hit), and an unordered result set would
  // paginate unstably.
  const relevanceTerms: Prisma.Sql[] = [];
  if (fuzzy && title) {
    relevanceTerms.push(Prisma.sql`word_similarity(${title}, title)`);
  }
  if (fuzzy && text) {
    relevanceTerms.push(Prisma.sql`word_similarity(${text}, coalesce(text, ''))`);
  }

  const explicitOrderColumn = orderColumn(params.order);
  const orderSql = explicitOrderColumn
    ? params.order === "title"
      ? Prisma.sql`ORDER BY title ASC`
      : Prisma.sql`ORDER BY ${explicitOrderColumn} ASC, title ASC`
    : relevanceTerms.length === 1
      ? Prisma.sql`ORDER BY ${relevanceTerms[0]} DESC, title ASC`
      : relevanceTerms.length > 1
        ? Prisma.sql`ORDER BY GREATEST(${Prisma.join(relevanceTerms, ", ")}) DESC, title ASC`
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
