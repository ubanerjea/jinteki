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
  PAGE_SIZE_OPTIONS,
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
  pack?: string;
  format?: string;
  order?: string;
  page?: number | string;
  pageSize?: number | string;
}

// Item 6 (PHASE_6_PLAN.md): minimal `field:value` operator syntax inside the
// `q` box, e.g. "f:anarch s:virus rootkit". Maps NRDB's own f/t/s/d operand
// letters onto the CardSearchParams field each already has a dropdown for.
// Case-insensitive prefix letter; only these four exact prefixes are
// recognized - anything else (e.g. "x:foo") is left alone as literal query
// text, same "don't invent behavior for the unrecognized case" caution
// src/lib/card-text.tsx's tag parser uses.
const OPERATOR_FIELD: Record<string, keyof Pick<CardSearchParams, "faction" | "type" | "keyword" | "side">> = {
  f: "faction",
  t: "type",
  s: "keyword",
  d: "side",
};
const OPERATOR_TOKEN = /^(f|t|s|d):(\S+)$/i;

// Splits a raw `q` string into recognized operator tokens (folded into the
// corresponding field) and residual free text. Explicit dropdown values
// (already-set `faction`/`type`/`keyword`/`side`) always win over a
// same-field operator token in `q` - the operator syntax only fills in
// whatever the dropdown left blank (PHASE_6_PLAN.md's "Things to confirm"
// precedence rule: dropdown is the primary, discoverable UI; the operator
// syntax is a power-user shortcut layered on top, not a competing source of
// truth).
export function extractOperators(
  q: string,
  explicit: Pick<CardSearchParams, "faction" | "type" | "keyword" | "side">,
): { residual: string; derived: Pick<CardSearchParams, "faction" | "type" | "keyword" | "side"> } {
  const derived: Pick<CardSearchParams, "faction" | "type" | "keyword" | "side"> = {};
  const residualTokens: string[] = [];

  for (const token of q.split(/\s+/).filter(Boolean)) {
    const match = token.match(OPERATOR_TOKEN);
    if (!match) {
      residualTokens.push(token);
      continue;
    }
    const field = OPERATOR_FIELD[match[1].toLowerCase()];
    const value = match[2];
    if (!explicit[field] && !derived[field]) {
      derived[field] = value;
    }
    // Recognized operator token is stripped from the residual text
    // regardless of whether it ended up being used (dropdown-wins case) -
    // it was still "consumed" as an operator, not left as free text.
  }

  return { residual: residualTokens.join(" "), derived };
}

// Explicit sort control (PHASE_5_PLAN.md, from the Scryfall UX research):
// values map 1:1 to a real column to ORDER BY. Anything else (including
// absent/blank, i.e. the <select>'s default option) falls back to the
// pre-existing behavior (similarity ranking when there's a `q`, else
// alphabetical by title) - additive, not a breaking change.
export const ORDER_COLUMNS: Record<string, Prisma.Sql> = {
  title: Prisma.sql`title`,
  faction: Prisma.sql`"factionCode"`,
  type: Prisma.sql`"typeCode"`,
};

// The only safe way to read ORDER_COLUMNS. A plain `order in ORDER_COLUMNS`
// / `ORDER_COLUMNS[order]` walks the prototype chain, so `?order=constructor`
// (or `toString`, `valueOf`, `hasOwnProperty`, `__proto__`) passed validation
// and then yielded a JS *function* instead of a Prisma.Sql - which Prisma
// bound as a parameter, emitting `ORDER BY $1 ASC, title ASC` with `$1 =
// NULL` and silently turning sorting into a no-op. Not injection (the value
// never reaches the SQL text), but wrong. hasOwnProperty.call keeps the
// lookup to the three real columns.
export function orderColumn(
  order: string | undefined,
): Prisma.Sql | undefined {
  if (!order) return undefined;
  return Object.prototype.hasOwnProperty.call(ORDER_COLUMNS, order)
    ? ORDER_COLUMNS[order]
    : undefined;
}

// Escapes LIKE/ILIKE's own metacharacters so a search term is matched
// literally, then wraps it for a substring match. Without this, `?title=%`
// matched all 2054 cards and `_` matched every card with a one-character
// window - while /cards/syntax promises "plain, case-insensitive substring
// matches". Backslash is LIKE's default escape character in Postgres, and
// the pattern is a bound parameter (never SQL text), so no explicit ESCAPE
// clause is needed - but the backslash itself has to be escaped first, or a
// trailing one would escape the closing `%`.
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, "\\$&")}%`;
}

// Shared by searchCards() (single-value facets, from /cards) and
// searchCardsAdvanced() (repeatable facets, from /cards/advanced), so the
// two pages can never drift on what "faction=anarch" means. Accepts either
// shape per facet; a single value keeps the plain `=` / `= ANY("keywords")`
// conditions searchCards() has always issued, so its query plans are
// unchanged by the extraction (PHASE_7_PLAN.md item 1).
//
// Semantics: OR within a facet, AND across facets. The AND is applied by the
// caller, which joins the returned fragments with " AND ".
//
// Every value stays inside a `Prisma.sql` tagged template (auto-
// parameterized) - never `$queryRawUnsafe` or string concatenation, per this
// file's header rule.
export function buildFacetConditions(params: {
  faction?: string | string[];
  side?: string;
  type?: string | string[];
  keyword?: string | string[];
  pack?: string | string[];
  format?: string;
}): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [];

  // `undefined` / `""` / `[]` all mean "no filter"; a one-element array is
  // treated exactly like the equivalent scalar.
  function normalize(value: string | string[] | undefined): string[] {
    if (value === undefined) return [];
    return (Array.isArray(value) ? value : [value])
      .map((v) => v.trim())
      .filter(Boolean);
  }

  // Scalar column, e.g. "factionCode": one value stays `= $1` (the exact
  // condition searchCards() issued before this extraction); several become
  // `= ANY($1)` against a bound text[].
  function scalarColumn(column: Prisma.Sql, values: string[]): void {
    if (values.length === 0) return;
    conditions.push(
      values.length === 1
        ? Prisma.sql`${column} = ${values[0]}`
        : Prisma.sql`${column} = ANY(${values})`,
    );
  }

  scalarColumn(Prisma.sql`"factionCode"`, normalize(params.faction));
  scalarColumn(Prisma.sql`"sideCode"`, normalize(params.side));
  scalarColumn(Prisma.sql`"typeCode"`, normalize(params.type));

  const keywords = normalize(params.keyword);
  if (keywords.length === 1) {
    // Array-containment check against `Card.keywords` (String[]) - mirrors
    // the existing faction/side/type equality-filter pattern exactly, per
    // PHASE_5_PLAN.md.
    conditions.push(Prisma.sql`${keywords[0]} = ANY("keywords")`);
  } else if (keywords.length > 1) {
    // `= ANY(col)` doesn't generalize to a set of wanted values, so several
    // requested subtypes become array *overlap* - "has any of these" - which
    // is the OR-within-a-facet semantics the advanced form specifies.
    conditions.push(Prisma.sql`"keywords" && ${keywords}`);
  }

  // Item 1 (PHASE_6_PLAN.md): identical equality-filter pattern to
  // faction/side/type above - no new pattern introduced.
  scalarColumn(Prisma.sql`"packCode"`, normalize(params.pack));

  const formats = normalize(params.format);
  if (formats.length > 0) {
    // Option A (format-descriptions-links-and-search-plan.md §5): filter by
    // format *membership* ("is this card in format X's pool at all"), not
    // "currently legal in X" (Option B - materially harder, deferred). No
    // native Card.formatIds column exists - format_ids lives inside
    // Card.raw, so this is a JSONB containment check (`@>`) rather than the
    // `= ANY(...)` pattern the keyword filter above uses against a real
    // String[] column. `to_jsonb(...)` converts the bound parameter into the
    // JSONB-scalar shape `@>` needs, keeping it a properly Prisma-
    // parameterized value (never raw string concatenation, per this file's
    // header). Confirmed working and performant (13ms unindexed sequential
    // scan against the real 2054-row table) in the plan's §2b investigation.
    // `format` is single-valued on both pages, so only the first value is
    // used - a set would need an OR of containment checks, which nothing
    // asks for.
    conditions.push(
      Prisma.sql`(raw->'attributes'->'format_ids') @> to_jsonb(${formats[0]}::text)`,
    );
  }

  return conditions;
}

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
  Pick<
    CardSearchParams,
    "q" | "faction" | "side" | "type" | "keyword" | "pack" | "format" | "order"
  > {
  const qRaw = firstParam(input, "q")?.trim();
  const explicitFaction = firstParam(input, "faction")?.trim();
  const explicitSide = firstParam(input, "side")?.trim();
  const explicitType = firstParam(input, "type")?.trim();
  const explicitKeyword = firstParam(input, "keyword")?.trim();
  const pack = firstParam(input, "pack")?.trim();
  const format = firstParam(input, "format")?.trim();
  const order = firstParam(input, "order")?.trim();

  // Item 6: fold any recognized f:/t:/s:/d: operator tokens out of `q` into
  // the matching field, before the usual blank -> undefined normalization -
  // explicit dropdown params (parsed above) always take precedence, per the
  // extractOperators() precedence rule.
  const { residual, derived } = qRaw
    ? extractOperators(qRaw, {
        faction: explicitFaction,
        type: explicitType,
        keyword: explicitKeyword,
        side: explicitSide,
      })
    : { residual: "", derived: {} };

  const q = residual.trim();
  const faction = explicitFaction || derived.faction;
  const side = explicitSide || derived.side;
  const type = explicitType || derived.type;
  const keyword = explicitKeyword || derived.keyword;

  return {
    q: q ? q : undefined,
    faction: faction ? faction : undefined,
    side: side ? side : undefined,
    type: type ? type : undefined,
    keyword: keyword ? keyword : undefined,
    pack: pack ? pack : undefined,
    format: format ? format : undefined,
    order: orderColumn(order) ? order : undefined,
    page: parsePage(firstParam(input, "page")),
    // Restricted to the set the "Per page" control offers, so the control
    // and the behaviour agree - `?pageSize=45` renders 30 rows with 30
    // highlighted, instead of 45 rows under a control claiming 30. The
    // restriction lives here, at the URL boundary, not in searchCards(),
    // whose programmatic callers (tests, /formats) still pass any clamped
    // size they like.
    pageSize: parsePageSize(
      firstParam(input, "pageSize"),
      DEFAULT_PAGE_SIZE,
      PAGE_SIZE_OPTIONS,
    ),
  };
}

export async function searchCards(
  params: CardSearchParams,
): Promise<PagedResult<CardSummary>> {
  const page = parsePage(params.page);
  const pageSize = parsePageSize(params.pageSize);
  const q = params.q?.trim() || undefined;

  // The six facet conditions live in buildFacetConditions() so /cards and
  // /cards/advanced share one definition of what each filter means
  // (PHASE_7_PLAN.md item 1). Behavior here is unchanged: every value
  // searchCards() receives is a scalar, which the helper renders as the same
  // `=` / `= ANY("keywords")` / `@>` conditions this function issued inline
  // before.
  const conditions: Prisma.Sql[] = buildFacetConditions(params);
  if (q) {
    // `<%` is pg_trgm's word-similarity operator (true when
    // word_similarity(q, column) exceeds pg_trgm.word_similarity_threshold,
    // default 0.6) - the best-matching substring of the column against q,
    // instead of `%`/similarity()'s whole-column comparison, so a short
    // query isn't diluted by the rest of a long title/text. `ILIKE` is
    // OR'd in as a plain-substring safety net for anything word_similarity
    // still misses (e.g. very short queries) - measured as cheap even
    // unindexed at this table's size. See plans/SEARCH_MATCHING.md.
    // likePattern() escapes `%`/`_`/`\` so they match literally - a
    // pre-existing hole shared with the advanced path, where `?q=%` returned
    // every card. The word_similarity half is unaffected (a lone `%` has no
    // trigrams, so it scores 0 and matches nothing there either).
    const likeQ = likePattern(q);
    conditions.push(
      Prisma.sql`(${q} <% title OR title ILIKE ${likeQ} OR ${q} <% text OR text ILIKE ${likeQ})`,
    );
  }

  const whereSql = conditions.length
    ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
    : Prisma.empty;

  // With no free-text query, order alphabetically (there's no similarity
  // score to rank by, and an unordered result set would paginate
  // unstably - see agent-reports/phase-2.md's decklist pagination bug for
  // why an explicit stable ORDER BY matters even for full lists).
  //
  // An explicit `order` takes priority over similarity ranking, since
  // choosing a sort column is a deliberate override of "most relevant
  // first".
  //
  // `order=title` is included deliberately. It used to be special-cased away
  // on the reasoning that title "behaves the same as the pre-existing
  // default" - true only when there's no `q`. With a `q` the default is
  // relevance, so skipping the branch made /cards?q=x&order=title silently
  // rank by relevance while ResultsControls rendered Title as the active
  // sort. That divergence became visible in Phase 7, which shares one
  // controls component between /cards and /cards/advanced/results
  // (PHASE_7_PLAN.md item 2, "identical by construction") while
  // cards-advanced.ts honored order=title and this did not.
  const explicitOrderColumn = orderColumn(params.order);
  const orderSql = explicitOrderColumn
    ? Prisma.sql`ORDER BY ${explicitOrderColumn} ASC, title ASC`
    : q
      ? Prisma.sql`ORDER BY GREATEST(word_similarity(${q}, title), word_similarity(${q}, coalesce(text, ''))) DESC, title ASC`
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
