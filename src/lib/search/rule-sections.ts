// Rules-glossary list/search query layer for /rules. Same
// parameterized-`Prisma.sql`-only rule as cards.ts/decklists.ts - see
// cards.ts's header comment for the full "no raw-SQL injection risk"
// reasoning.
//
// Unlike cards/decklists, RuleSection.id is a dotted section number
// ("1.1", "10.12", ...) that sorts wrong under plain lexicographic ORDER BY
// id (e.g. "10.1" < "1.1" as text - confirmed against the real 119-row
// table at build time). `string_to_array(id, '.')::int[]` casts each
// section id to an int array so Postgres compares it element-wise
// (numerically) instead - verified directly via psql that this produces
// 1.1, 1.2, ..., 1.10, 1.11, ..., 10.1, 10.2, ... in the correct order.

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  pageOffset,
  parsePage,
  parsePageSize,
  toPagedResult,
} from "./pagination";
import { firstParam, type PagedResult, type SearchParamsInput } from "./types";

export interface RuleSectionSearchParams {
  q?: string;
  page?: number | string;
  pageSize?: number | string;
}

export interface RuleSectionSummary {
  id: string;
  title: string;
  anchor: string;
  bodyText: string;
}

export function parseRuleSectionSearchParams(
  input: SearchParamsInput,
): Required<Pick<RuleSectionSearchParams, "page" | "pageSize">> &
  Pick<RuleSectionSearchParams, "q"> {
  const q = firstParam(input, "q")?.trim();
  return {
    q: q ? q : undefined,
    page: parsePage(firstParam(input, "page")),
    pageSize: parsePageSize(firstParam(input, "pageSize")),
  };
}

const NATURAL_ID_ORDER = Prisma.sql`string_to_array(id, '.')::int[]`;

export async function searchRuleSections(
  params: RuleSectionSearchParams,
): Promise<PagedResult<RuleSectionSummary>> {
  const page = parsePage(params.page);
  const pageSize = parsePageSize(params.pageSize);
  const q = params.q?.trim() || undefined;

  // `<%` (word_similarity) over `%` (whole-string similarity), plus a
  // plain `ILIKE` substring safety net - see cards.ts /
  // plans/SEARCH_MATCHING.md.
  const likeQ = q ? `%${q}%` : undefined;
  const whereSql = q
    ? Prisma.sql`WHERE (${q} <% title OR title ILIKE ${likeQ} OR ${q} <% "bodyText" OR "bodyText" ILIKE ${likeQ})`
    : Prisma.empty;

  // No free-text query: browse in natural (numeric) section order. With a
  // query: rank by similarity first, falling back to natural section order
  // for ties (rather than title-alphabetical, which would be a strange
  // secondary sort for numbered doc sections).
  const orderSql = q
    ? Prisma.sql`ORDER BY GREATEST(word_similarity(${q}, title), word_similarity(${q}, "bodyText")) DESC, ${NATURAL_ID_ORDER} ASC`
    : Prisma.sql`ORDER BY ${NATURAL_ID_ORDER} ASC`;

  const [items, totalRows] = await Promise.all([
    prisma.$queryRaw<RuleSectionSummary[]>(Prisma.sql`
      SELECT id, title, anchor, "bodyText"
      FROM "RuleSection"
      ${whereSql}
      ${orderSql}
      LIMIT ${pageSize} OFFSET ${pageOffset(page, pageSize)}
    `),
    prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS count FROM "RuleSection" ${whereSql}
    `),
  ]);

  const total = Number(totalRows[0]?.count ?? BigInt(0));
  return toPagedResult(items, total, page, pageSize);
}
