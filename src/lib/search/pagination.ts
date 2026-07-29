// Pure pagination math shared by searchCards/searchDecklists - no DB access,
// so this is safe to unit-test without a Postgres connection (unlike the
// trigram-ranking behavior in cards.ts/decklists.ts, which does need one).

import type { PagedResult } from "./types";

export const DEFAULT_PAGE_SIZE = 30;
export const MAX_PAGE_SIZE = 100;

function toFiniteNumber(raw: string | number | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = typeof raw === "number" ? raw : Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

// Always returns a valid 1-based page number. Non-numeric, missing, zero,
// negative, or fractional input all fall back to page 1 rather than
// erroring - a malformed `?page=` in a bookmarked/shared URL should degrade
// to "show the first page," not a crash.
export function parsePage(raw: string | number | undefined): number {
  const n = toFiniteNumber(raw);
  if (n === undefined || n < 1) return 1;
  return Math.floor(n);
}

// Clamped to [1, MAX_PAGE_SIZE] - protects against a URL asking for an
// absurdly large page (e.g. `?pageSize=999999`) turning into an
// unbounded query.
export function parsePageSize(
  raw: string | number | undefined,
  fallback: number = DEFAULT_PAGE_SIZE,
): number {
  const n = toFiniteNumber(raw);
  if (n === undefined || n < 1) return fallback;
  return Math.min(Math.floor(n), MAX_PAGE_SIZE);
}

export function pageOffset(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

// total === 0 still reports totalPages === 1 (an empty "page 1 of 1"),
// rather than 0, so callers can always render "Page X of Y" without a
// special case for the no-results state.
export function toPagedResult<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PagedResult<T> {
  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
  return { items, total, page, pageSize, totalPages };
}
