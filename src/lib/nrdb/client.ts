// Thin typed fetch wrapper for NetrunnerDB's public v3 API.
//
// Confirmed live (2026-07-27) against https://api.netrunnerdb.com/api/docs
// and by hitting the real endpoints directly - not assumed from memory or
// from Phase 1 era knowledge:
//   - Base URL: https://api.netrunnerdb.com/api/v3/public
//     (the docs page's own example requests point at
//     `api-preview.netrunnerdb.com`, which returned HTTP 503 from this
//     machine; `api.netrunnerdb.com` - the production host actually linked
//     from every resource's `links.self` in real responses - is live and is
//     what these sync scripts use.)
//   - JSON:API format throughout: `{ data, links, meta }` list envelopes,
//     `links.next` present iff another page exists, `meta.stats.total.count`
//     gives the total row count across all pages.
//   - Pagination params: `page[number]` (1-based) and `page[size]`. No
//     documented hard cap was found; `page[size]=5000` on /cards (2054 total
//     rows) returned everything in one page with HTTP 200. Sync scripts
//     still page conservatively and add a delay between requests (see
//     `paginate` below) rather than relying on that.
//   - No authentication required for the public API.
//   - Sorting/filtering: `sort=-updated_at` and `filter[updated_at][gte]=<ISO
//     date>` both verified working (a filter value in the far future - e.g.
//     `2099-01-01` - reliably returns `meta.stats.total.count: 0`, proving
//     the server actually applies the filter rather than silently ignoring
//     an unrecognized param and returning everything). sync-decklists.ts
//     uses this for incremental sync.
//   - No documented rate limit was found. `paginate` fetches pages
//     sequentially (never in parallel) with a modest delay between requests
//     by default, per PHASE_2_PLAN.md's "be a good citizen" instruction.

export const NRDB_BASE_URL = "https://api.netrunnerdb.com/api/v3/public";

export class NrdbApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
  ) {
    super(message);
    this.name = "NrdbApiError";
  }
}

interface JsonApiListEnvelope<T> {
  data: T[];
  links?: { next?: string };
  meta?: { stats?: { total?: { count?: number } } };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchListPage<T>(
  path: string,
  params: URLSearchParams,
): Promise<JsonApiListEnvelope<T>> {
  const url = `${NRDB_BASE_URL}${path}?${params.toString()}`;
  const res = await fetch(url);

  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable body>");
    throw new NrdbApiError(
      `NRDB request failed: ${res.status} ${res.statusText} for ${url} - ${body.slice(0, 500)}`,
      res.status,
      url,
    );
  }

  return (await res.json()) as JsonApiListEnvelope<T>;
}

export interface PaginateOptions {
  /** Rows per page. Default 100. */
  pageSize?: number;
  /** Delay between sequential page requests, in ms. Default 250. Set 0 to disable (tests only). */
  delayMs?: number;
  /**
   * Extra raw query params, e.g. `[["filter[updated_at][gte]", "2026-01-01T00:00:00Z"], ["sort", "-updated_at"]]`.
   * Passed through verbatim as `URLSearchParams` entries (brackets get
   * percent-encoded automatically, matching what the live API expects).
   */
  extraParams?: [string, string][];
}

/**
 * Async generator yielding one page (array of resources) at a time, fetched
 * sequentially with a delay between requests. Stops when the response has no
 * `links.next`.
 */
export async function* paginate<T>(
  path: string,
  options: PaginateOptions = {},
): AsyncGenerator<T[], void, void> {
  const pageSize = options.pageSize ?? 100;
  const delayMs = options.delayMs ?? 250;

  let pageNumber = 1;
  while (true) {
    const params = new URLSearchParams();
    params.set("page[number]", String(pageNumber));
    params.set("page[size]", String(pageSize));
    for (const [key, value] of options.extraParams ?? []) {
      params.set(key, value);
    }

    const page = await fetchListPage<T>(path, params);
    yield page.data;

    if (!page.links?.next) {
      return;
    }

    pageNumber += 1;
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }
}

/**
 * Convenience wrapper over `paginate` for small resources (factions, packs)
 * where buffering the whole collection in memory is fine.
 */
export async function fetchAll<T>(
  path: string,
  options: PaginateOptions = {},
): Promise<T[]> {
  const all: T[] = [];
  for await (const page of paginate<T>(path, options)) {
    all.push(...page);
  }
  return all;
}
