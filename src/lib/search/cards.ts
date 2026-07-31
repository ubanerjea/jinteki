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
  order?: string;
  page?: number | string;
  pageSize?: number | string;
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
  Pick<CardSearchParams, "q" | "faction" | "side" | "type" | "keyword" | "order"> {
  const q = firstParam(input, "q")?.trim();
  const faction = firstParam(input, "faction")?.trim();
  const side = firstParam(input, "side")?.trim();
  const type = firstParam(input, "type")?.trim();
  const keyword = firstParam(input, "keyword")?.trim();
  const order = firstParam(input, "order")?.trim();
  return {
    q: q ? q : undefined,
    faction: faction ? faction : undefined,
    side: side ? side : undefined,
    type: type ? type : undefined,
    keyword: keyword ? keyword : undefined,
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
  if (q) {
    // `%` is pg_trgm's similarity operator (true when similarity exceeds
    // pg_trgm.similarity_threshold, default 0.3 - confirmed sensible on real
    // data at build time, see agent-reports/phase-4.md). Matching against
    // either title or text, per PHASE_4_PLAN.md's "free-text trigram search
    // across title+text".
    conditions.push(Prisma.sql`(title % ${q} OR text % ${q})`);
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
      ? Prisma.sql`ORDER BY GREATEST(similarity(title, ${q}), similarity(coalesce(text, ''), ${q})) DESC, title ASC`
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
