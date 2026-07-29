// Decklist list/search query layer for /decklists. Same
// parameterized-`Prisma.sql`-only rule as cards.ts - see that file's header
// comment for the full "no raw-SQL injection risk" reasoning.

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  pageOffset,
  parsePage,
  parsePageSize,
  toPagedResult,
} from "./pagination";
import { firstParam, type PagedResult, type SearchParamsInput } from "./types";

export interface DecklistSearchParams {
  q?: string;
  identity?: string;
  page?: number | string;
  pageSize?: number | string;
}

export interface DecklistSummary {
  id: string;
  name: string;
  identityCode: string;
  identityTitle: string;
}

export function parseDecklistSearchParams(
  input: SearchParamsInput,
): Required<Pick<DecklistSearchParams, "page" | "pageSize">> &
  Pick<DecklistSearchParams, "q" | "identity"> {
  const q = firstParam(input, "q")?.trim();
  const identity = firstParam(input, "identity")?.trim();
  return {
    q: q ? q : undefined,
    identity: identity ? identity : undefined,
    page: parsePage(firstParam(input, "page")),
    pageSize: parsePageSize(firstParam(input, "pageSize")),
  };
}

export async function searchDecklists(
  params: DecklistSearchParams,
): Promise<PagedResult<DecklistSummary>> {
  const page = parsePage(params.page);
  const pageSize = parsePageSize(params.pageSize);
  const q = params.q?.trim() || undefined;

  // Table-qualified (`d.`/`c.`) since the query joins Card for the
  // identity's title - unqualified `name`/`"identityCode"` would be
  // ambiguous once both tables are in scope.
  const conditions: Prisma.Sql[] = [];
  if (params.identity) {
    conditions.push(Prisma.sql`d."identityCode" = ${params.identity}`);
  }
  if (q) {
    conditions.push(Prisma.sql`d.name % ${q}`);
  }

  const whereSql = conditions.length
    ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
    : Prisma.empty;

  const orderSql = q
    ? Prisma.sql`ORDER BY similarity(d.name, ${q}) DESC, d.name ASC`
    : Prisma.sql`ORDER BY d.name ASC`;

  const [items, totalRows] = await Promise.all([
    prisma.$queryRaw<DecklistSummary[]>(Prisma.sql`
      SELECT d.id, d.name, d."identityCode" AS "identityCode", c.title AS "identityTitle"
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
