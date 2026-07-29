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

export function firstParam(
  input: SearchParamsInput,
  key: string,
): string | undefined {
  const value = input[key];
  return Array.isArray(value) ? value[0] : value;
}
