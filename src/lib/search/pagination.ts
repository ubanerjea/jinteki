// Pure pagination math shared by searchCards/searchDecklists - no DB access,
// so this is safe to unit-test without a Postgres connection (unlike the
// trigram-ranking behavior in cards.ts/decklists.ts, which does need one).

import type { PagedResult } from "./types";

export const DEFAULT_PAGE_SIZE = 30;
export const MAX_PAGE_SIZE = 100;

// The page sizes the card pages actually *offer* - the "Per page" links on
// /cards and /cards/advanced/results, and the "Cards per page" <select> on
// /cards/advanced. Canonical here rather than in the component so the
// parsers can hold themselves to the same set without a lib -> component
// import (ADVANCED_CARD_SEARCH_PLAN.md: `pageSize` ∈ {30, 60, 100}).
export const PAGE_SIZE_OPTIONS: readonly number[] = [30, 60, 100];

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
//
// `allowed` optionally narrows that to an exact set: a value outside it
// falls back rather than being honoured. Used by the card parsers, whose
// pages render a fixed 30/60/100 control - without it `?pageSize=45`
// rendered 45 rows while the control showed 30, so re-submitting the form
// silently discarded the 45. Left off by default so /decklists and /rules,
// which share this helper, keep the plain clamp they have always had.
export function parsePageSize(
  raw: string | number | undefined,
  fallback: number = DEFAULT_PAGE_SIZE,
  allowed?: readonly number[],
): number {
  const n = toFiniteNumber(raw);
  if (n === undefined || n < 1) return fallback;
  const size = Math.min(Math.floor(n), MAX_PAGE_SIZE);
  if (allowed && !allowed.includes(size)) return fallback;
  return size;
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
