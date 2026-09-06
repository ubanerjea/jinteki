// Quick-view tab query layer for /decklists (PHASE_8_PLAN.md item 2).
//
// The old searchDecklists()/parseDecklistSearchParams() (word-similarity +
// ILIKE on Decklist.name, equality on identityCode) are gone, not
// deprecated - /decklists no longer has a text search box at all; structured
// filtering moved entirely to /decklists/advanced
// (src/lib/search/decklists-advanced.ts), the same way PHASE_7_PLAN.md fully
// deleted /cards' seven facet <select>s rather than leaving them
// half-working. This file now holds only the four quick-view tab queries,
// each a fixed sort/filter with no user-composable criteria - genuinely
// different semantics from an advanced multi-criterion search, which is why
// they live apart from decklists-advanced.ts entirely (same reasoning
// cards-advanced.ts gives for being separate from searchCards()).
//
// Same parameterized-`Prisma.sql`-only rule as cards.ts - see that file's
// header for the full "no raw-SQL injection risk" reasoning.

import { Prisma } from "@prisma/client";

import { publicDecklistSql } from "@/lib/decklist-visibility";
import { prisma } from "@/lib/prisma";

import {
  pageOffset,
  parsePage,
  parsePageSize,
  toPagedResult,
} from "./pagination";
import { firstParam, type PagedResult, type SearchParamsInput } from "./types";

export type DecklistTab = "recent" | "updated" | "week" | "favorited";

export const DECKLIST_TABS: { value: DecklistTab; label: string }[] = [
  { value: "recent", label: "Recent" },
  { value: "updated", label: "Recently updated" },
  { value: "week", label: "Posted this week" },
  { value: "favorited", label: "Favorited by jinteki users" },
];

const DEFAULT_TAB: DecklistTab = "recent";

export function parseDecklistTab(input: SearchParamsInput): DecklistTab {
  const raw = firstParam(input, "tab")?.trim();
  const match = DECKLIST_TABS.find((t) => t.value === raw);
  return match ? match.value : DEFAULT_TAB;
}

export interface DecklistTabParams {
  tab?: DecklistTab;
  page?: number | string;
  pageSize?: number | string;
}

// One row shape shared by every tab, so the page component doesn't need a
// per-tab type. `favoriteCount` is only meaningful (non-null) on the
// `favorited` tab; `createdAt`/`updatedAt` are always populated post-backfill
// (see PHASE_8_PLAN.md's migration section) but stay nullable in the type
// since the underlying columns are nullable.
export interface DecklistTabRow {
  id: string;
  name: string;
  identityCode: string;
  identityTitle: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  favoriteCount: number | null;
}

export async function searchDecklistsByTab(
  params: DecklistTabParams,
): Promise<PagedResult<DecklistTabRow>> {
  const tab = params.tab ?? DEFAULT_TAB;
  const page = parsePage(params.page);
  const pageSize = parsePageSize(params.pageSize);
  const offset = pageOffset(page, pageSize);

  if (tab === "favorited") {
    // Inner join naturally excludes zero-favorite decks - no explicit
    // minimum-count filter needed, the join *is* the filter. Genuinely
    // different data from NRDB's own Popular tab (jinteki's own users, at
    // jinteki's own scale) - see PHASE_8_PLAN.md's Divergence section for
    // why this is labeled distinctly rather than "Popular".
    const [items, totalRows] = await Promise.all([
      prisma.$queryRaw<
        (DecklistTabRow & { favoriteCount: number })[]
      >(Prisma.sql`
        SELECT d.id, d.name, d."identityCode" AS "identityCode",
               c.title AS "identityTitle", d."createdAt", d."updatedAt",
               count(f.*)::int AS "favoriteCount"
        FROM "Decklist" d
        JOIN "Card" c ON c.code = d."identityCode"
        JOIN "DecklistFavorite" f ON f."decklistId" = d.id
        WHERE ${publicDecklistSql()}
        GROUP BY d.id, c.title
        ORDER BY count(f.*) DESC, d."createdAt" DESC NULLS LAST, d.id ASC
        LIMIT ${pageSize} OFFSET ${offset}
      `),
      prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT count(DISTINCT d.id)::bigint AS count
        FROM "Decklist" d
        JOIN "DecklistFavorite" f ON f."decklistId" = d.id
        WHERE ${publicDecklistSql()}
      `),
    ]);
    const total = Number(totalRows[0]?.count ?? BigInt(0));
    return toPagedResult(items, total, page, pageSize);
  }

  const whereSql =
    tab === "week"
      ? Prisma.sql`WHERE ${publicDecklistSql()} AND d."createdAt" >= now() - interval '7 days'`
      : Prisma.sql`WHERE ${publicDecklistSql()}`;

  // Recent and Posted-this-week both sort by createdAt; Recently-updated
  // sorts by updatedAt - a genuinely different signal (a deck actively being
  // revised surfaces here even if posted years ago), not a reskin of Recent.
  // `NULLS LAST`/tie-break on `id` matters for stable pagination even though
  // the backfill verification confirmed no NULL createdAt rows remain.
  const orderColumn = tab === "updated" ? Prisma.sql`"updatedAt"` : Prisma.sql`"createdAt"`;
  const orderSql = Prisma.sql`ORDER BY d.${orderColumn} DESC NULLS LAST, d.id ASC`;

  const [items, totalRows] = await Promise.all([
    prisma.$queryRaw<DecklistTabRow[]>(Prisma.sql`
      SELECT d.id, d.name, d."identityCode" AS "identityCode",
             c.title AS "identityTitle", d."createdAt", d."updatedAt",
             NULL::int AS "favoriteCount"
      FROM "Decklist" d
      JOIN "Card" c ON c.code = d."identityCode"
      ${whereSql}
      ${orderSql}
      LIMIT ${pageSize} OFFSET ${offset}
    `),
    prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS count
      FROM "Decklist" d
      ${whereSql}
    `),
  ]);

  const total = Number(totalRows[0]?.count ?? BigInt(0));
  return toPagedResult(items, total, page, pageSize);
}
