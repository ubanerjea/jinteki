// Shared types for the search query layer (src/lib/search/*).
//
// Both `searchCards` and `searchDecklists` return a `PagedResult<T>` so page
// components can render results + pagination controls the same way
// regardless of which entity is being searched.

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Next.js App Router's `searchParams` prop shape (a page can have a
// repeated query key, which Next surfaces as `string[]`). Search-param
// parsers below take this shape directly so page components can pass their
// resolved `searchParams` straight through without adapting it first.
export type SearchParamsInput = Record<string, string | string[] | undefined>;

// Postgres text columns cannot hold a NUL (0x00) byte: binding one - even
// as a parameter - fails the whole statement with `invalid byte sequence for
// encoding "UTF8": 0x00`, which surfaced as an unhandled HTTP 500 on every
// search page for a crafted URL like `/cards?q=a%00b`.
//
// Stripped rather than rejected: a NUL is never meaningful search input, so
// a silently-cleaned query is a better answer than an error page. Applied
// here in the two shared param readers rather than in each parser, so every
// current and future caller (cards, advanced cards, decklists, rule
// sections) is covered by construction - the same reason
// buildFacetConditions() is shared rather than copied.
function stripNul(value: string): string {
  return value.includes("\0") ? value.replaceAll("\0", "") : value;
}

export function firstParam(
  input: SearchParamsInput,
  key: string,
): string | undefined {
  const value = input[key];
  const first = Array.isArray(value) ? value[0] : value;
  return first === undefined ? undefined : stripNul(first);
}

// Multi-value counterpart to firstParam(), for the repeatable facet params
// on /cards/advanced (`?type=event&type=program`). Next surfaces a repeated
// query key as `string[]` and a single occurrence as a plain `string`, so
// both shapes are normalized to an array here. Values are trimmed and blanks
// dropped, matching how firstParam()'s callers normalize a single value -
// an empty `<select>` option or a stray `&faction=` must not become a
// filter on the empty string.
export function allParams(input: SearchParamsInput, key: string): string[] {
  const value = input[key];
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value])
    .map((v) => stripNul(v).trim())
    .filter(Boolean);
}
