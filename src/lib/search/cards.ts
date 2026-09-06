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
import {
  collectFormatValues,
  collectTextTerms,
  parseBannedValue,
  parseQuery,
  type PrefixOp,
  type QueryAst,
  type TextColumn,
} from "./query-syntax";
import { firstParam, type PagedResult, type SearchParamsInput } from "./types";

export interface CardSearchParams {
  q?: string;
  faction?: string;
  side?: string;
  type?: string;
  keyword?: string;
  pack?: string;
  format?: string;
  // "1" | "0" | unset. Same Ignore/Yes/No shape as advanced. Only applied
  // when `format` is also set (URL facet); prefix `banned:` is compiled
  // from the AST in searchCards().
  banned?: string;
  order?: string;
  page?: number | string;
  pageSize?: number | string;
}

export function validBanned(value: string | undefined): "1" | "0" | undefined {
  return value === "1" || value === "0" ? value : undefined;
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
export async function buildFacetConditions(params: {
  faction?: string | string[];
  side?: string;
  type?: string | string[];
  keyword?: string | string[];
  pack?: string | string[];
  format?: string;
}): Promise<Prisma.Sql[]> {
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

  // Any printing, not original-only packCode. Several values are OR'd
  // (FacetPicker "any of these"), same as the other multi-value facets.
  const packs = normalize(params.pack);
  if (packs.length === 1) {
    conditions.push(
      Prisma.sql`(raw->'attributes'->'card_set_ids') @> to_jsonb(${packs[0]}::text)`,
    );
  } else if (packs.length > 1) {
    conditions.push(
      Prisma.sql`(${Prisma.join(
        packs.map(
          (code) =>
            Prisma.sql`(raw->'attributes'->'card_set_ids') @> to_jsonb(${code}::text)`,
        ),
        " OR ",
      )})`,
    );
  }

  const formats = normalize(params.format);
  if (formats.length > 0) {
    // Current-pool membership: Format.activeCardPoolId against
    // card_pool_ids, not historical format_ids. Unknown format id or a
    // null activeCardPoolId matches nothing - there is no current pool.
    const activeFormat = await prisma.format.findUnique({
      where: { id: formats[0] },
      select: { activeCardPoolId: true },
    });
    if (activeFormat?.activeCardPoolId) {
      conditions.push(
        Prisma.sql`(raw->'attributes'->'card_pool_ids') @> to_jsonb(${activeFormat.activeCardPoolId}::text)`,
      );
    } else {
      conditions.push(Prisma.sql`false`);
    }
  }

  return conditions;
}

// Shared by searchCards() and searchCardsAdvanced(). URL/advanced banned is
// only applied when `format` is also set; banned=1 with a format that has
// no activeRestrictionId matches nothing; banned=0 in that case is a no-op.
export async function bannedCondition(
  formatId: string | undefined,
  banned: "1" | "0" | undefined,
): Promise<Prisma.Sql | undefined> {
  if (!banned || !formatId) return undefined;
  const activeFormat = await prisma.format.findUnique({
    where: { id: formatId },
    select: { activeRestrictionId: true },
  });
  if (activeFormat?.activeRestrictionId) {
    const contains = Prisma.sql`(raw->'attributes'->'restrictions'->'banned') @> to_jsonb(${activeFormat.activeRestrictionId}::text)`;
    return banned === "1" ? contains : Prisma.sql`NOT (${contains})`;
  }
  if (banned === "1") return Prisma.sql`false`;
  return undefined;
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
    | "q"
    | "faction"
    | "side"
    | "type"
    | "keyword"
    | "pack"
    | "format"
    | "banned"
    | "order"
  > {
  const qRaw = firstParam(input, "q")?.trim();
  const faction = firstParam(input, "faction")?.trim();
  const side = firstParam(input, "side")?.trim();
  const type = firstParam(input, "type")?.trim();
  const keyword = firstParam(input, "keyword")?.trim();
  const pack = firstParam(input, "pack")?.trim();
  const format = firstParam(input, "format")?.trim();
  const order = firstParam(input, "order")?.trim();

  // `q` is the trimmed raw box string. Prefixes inside it are compiled from
  // the AST in searchCards(); they are not folded into these URL-facet
  // fields (doing both would double-filter). URL facets still win at
  // compile time over the same field in q.
  return {
    q: qRaw ? qRaw : undefined,
    faction: faction ? faction : undefined,
    side: side ? side : undefined,
    type: type ? type : undefined,
    keyword: keyword ? keyword : undefined,
    pack: pack ? pack : undefined,
    format: format ? format : undefined,
    banned: validBanned(firstParam(input, "banned")?.trim()),
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

interface UrlFacets {
  faction?: string;
  type?: string;
  keyword?: string;
  side?: string;
  pack?: string;
  format?: string;
  banned?: "1" | "0";
}

async function resolvePackCodes(value: string): Promise<string[]> {
  const or: Prisma.PackWhereInput[] = [
    { code: { equals: value, mode: "insensitive" } },
    { name: { equals: value, mode: "insensitive" } },
  ];
  if (/^\d+$/.test(value)) {
    or.push({ position: Number(value) });
  }
  const packs = await prisma.pack.findMany({
    where: { OR: or },
    select: { code: true },
  });
  return [...new Set(packs.map((p) => p.code))];
}

async function resolveCyclePackCodes(value: string): Promise<string[]> {
  const or: Prisma.CycleWhereInput[] = [
    { id: { equals: value, mode: "insensitive" } },
    { name: { equals: value, mode: "insensitive" } },
  ];
  if (/^\d+$/.test(value)) {
    or.push({ position: Number(value) });
  }
  const cycle = await prisma.cycle.findFirst({
    where: { OR: or },
    select: { id: true },
  });
  if (!cycle) return [];
  const packs = await prisma.pack.findMany({
    where: { cardCycleId: cycle.id },
    select: { code: true },
  });
  return packs.map((p) => p.code);
}

async function resolveFormatId(value: string): Promise<string | undefined> {
  const format = await prisma.format.findFirst({
    where: {
      OR: [
        { id: { equals: value, mode: "insensitive" } },
        { name: { equals: value, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  return format?.id;
}

function textConditionSql(column: TextColumn, phrase: string): Prisma.Sql {
  if (!phrase) return Prisma.sql`false`;
  const like = likePattern(phrase);
  if (column === "title") {
    return Prisma.sql`(${phrase} <% title OR title ILIKE ${like})`;
  }
  if (column === "text") {
    return Prisma.sql`(${phrase} <% text OR text ILIKE ${like})`;
  }
  return Prisma.sql`(${phrase} <% title OR title ILIKE ${like} OR ${phrase} <% text OR text ILIKE ${like})`;
}

function relevanceSql(column: TextColumn, phrase: string): Prisma.Sql {
  if (column === "title") {
    return Prisma.sql`word_similarity(${phrase}, title)`;
  }
  if (column === "text") {
    return Prisma.sql`word_similarity(${phrase}, coalesce(text, ''))`;
  }
  return Prisma.sql`GREATEST(word_similarity(${phrase}, title), word_similarity(${phrase}, coalesce(text, '')))`;
}

async function firstCondition(
  params: Parameters<typeof buildFacetConditions>[0],
): Promise<Prisma.Sql> {
  const conditions = await buildFacetConditions(params);
  return conditions[0] ?? Prisma.sql`false`;
}

async function compileNode(
  ast: QueryAst,
  url: UrlFacets,
  bannedFormatId: string | undefined,
): Promise<Prisma.Sql | null> {
  switch (ast.type) {
    case "match_all":
      return null;
    case "match_none":
      return Prisma.sql`false`;
    case "and": {
      const left = await compileNode(ast.left, url, bannedFormatId);
      const right = await compileNode(ast.right, url, bannedFormatId);
      if (!left) return right;
      if (!right) return left;
      return Prisma.sql`(${left} AND ${right})`;
    }
    case "or": {
      const left = await compileNode(ast.left, url, bannedFormatId);
      const right = await compileNode(ast.right, url, bannedFormatId);
      if (!left || !right) return null;
      return Prisma.sql`(${left} OR ${right})`;
    }
    case "not": {
      const child = await compileNode(ast.child, url, bannedFormatId);
      if (!child) return Prisma.sql`false`;
      return Prisma.sql`NOT (${child})`;
    }
    case "text":
      return textConditionSql(ast.column, ast.value);
    case "prefix":
      return compilePrefix(ast.op, ast.value, url, bannedFormatId);
  }
}

async function compilePrefix(
  op: PrefixOp,
  value: string,
  url: UrlFacets,
  bannedFormatId: string | undefined,
): Promise<Prisma.Sql | null> {
  switch (op) {
    case "faction":
      if (url.faction) return null;
      return firstCondition({ faction: value });
    case "type":
      if (url.type) return null;
      return firstCondition({ type: value });
    case "keyword":
      if (url.keyword) return null;
      return firstCondition({ keyword: value });
    case "side":
      if (url.side) return null;
      return firstCondition({ side: value });
    case "set": {
      if (url.pack) return null;
      const codes = await resolvePackCodes(value);
      if (codes.length === 0) return Prisma.sql`false`;
      return firstCondition({ pack: codes.length === 1 ? codes[0] : codes });
    }
    case "cycle": {
      const codes = await resolveCyclePackCodes(value);
      if (codes.length === 0) return Prisma.sql`false`;
      return firstCondition({ pack: codes.length === 1 ? codes[0] : codes });
    }
    case "format": {
      if (url.format) return null;
      const id = await resolveFormatId(value);
      if (!id) return Prisma.sql`false`;
      return firstCondition({ format: id });
    }
    case "banned": {
      if (url.banned) return null;
      const yes = parseBannedValue(value);
      if (yes === null) return Prisma.sql`false`;
      if (!bannedFormatId) {
        return yes ? Prisma.sql`false` : null;
      }
      const sql = await bannedCondition(bannedFormatId, yes ? "1" : "0");
      return sql ?? null;
    }
  }
}

async function compileAst(
  ast: QueryAst,
  url: UrlFacets,
): Promise<{ sql: Prisma.Sql | null; textTerms: { column: TextColumn; value: string }[] }> {
  if (ast.type === "match_none") {
    return { sql: Prisma.sql`false`, textTerms: [] };
  }
  const formatValues = collectFormatValues(ast);
  let bannedFormatId: string | undefined;
  if (formatValues[0]) {
    bannedFormatId = await resolveFormatId(formatValues[0]);
  }
  if (!bannedFormatId) bannedFormatId = url.format;
  const sql = await compileNode(ast, url, bannedFormatId);
  return { sql, textTerms: collectTextTerms(ast) };
}

export async function searchCards(
  params: CardSearchParams,
): Promise<PagedResult<CardSummary>> {
  const page = parsePage(params.page);
  const pageSize = parsePageSize(params.pageSize);
  const q = params.q?.trim() || undefined;

  // URL facets only - prefixes inside `q` are compiled from the AST below,
  // not folded into these fields. AND of the two is the whole predicate.
  const conditions: Prisma.Sql[] = await buildFacetConditions(params);
  const urlBanned = validBanned(params.banned);
  const urlBannedSql = await bannedCondition(params.format, urlBanned);
  if (urlBannedSql) conditions.push(urlBannedSql);

  let textTerms: { column: TextColumn; value: string }[] = [];
  if (q) {
    const compiled = await compileAst(parseQuery(q), {
      faction: params.faction,
      type: params.type,
      keyword: params.keyword,
      side: params.side,
      pack: params.pack,
      format: params.format,
      banned: urlBanned,
    });
    if (compiled.sql) conditions.push(compiled.sql);
    textTerms = compiled.textTerms;
  }

  const whereSql = conditions.length
    ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
    : Prisma.empty;

  // With no text terms, order alphabetically (there's no similarity score
  // to rank by, and an unordered result set would paginate unstably - see
  // agent-reports/phase-2.md's decklist pagination bug for why an explicit
  // stable ORDER BY matters even for full lists).
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
  const relevanceTerms = textTerms.map((t) => relevanceSql(t.column, t.value));
  const orderSql = explicitOrderColumn
    ? Prisma.sql`ORDER BY ${explicitOrderColumn} ASC, title ASC`
    : relevanceTerms.length === 1
      ? Prisma.sql`ORDER BY ${relevanceTerms[0]} DESC, title ASC`
      : relevanceTerms.length > 1
        ? Prisma.sql`ORDER BY GREATEST(${Prisma.join(relevanceTerms, ", ")}) DESC, title ASC`
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
