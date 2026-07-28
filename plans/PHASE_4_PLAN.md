# jinteki — Phase 4 Build Plan: Card & Decklist Browsing + Search

## Context

Phases 1–3 built the foundation, the NRDB data sync, and the rules-glossary scraper — but there is still no actual UI to browse any of it; the homepage is still the default `create-next-app` scaffold page. Phase 4 builds the first real user-facing feature: browsing and searching cards and decklists, using the `pg_trgm`/GIN trigram search infrastructure that's existed in the schema since Phase 1 but has never actually been queried by application code. Rules-glossary browsing, the right-click rulings/rules integration, and favorites remain Phase 5, per the roadmap `PHASE_2_PLAN.md` laid out.

## Scope

1. Replace the default Next.js homepage with minimal navigation to Cards and Decklists.
2. A card list/search page and a card detail page.
3. A decklist list/search page and a decklist detail page.
4. A reusable, tested Postgres trigram-search query layer shared by both.
5. Vitest tests for the search-query logic.

## Hard requirement: no raw-SQL injection risk

Free-text search terms must never be interpolated directly into a SQL string. Any trigram-similarity query (which needs `$queryRaw` since Prisma's normal query builder doesn't express `similarity()`/`%` trigram operators) must use Prisma's tagged-template `$queryRaw`/`Prisma.sql` (auto-parameterized), never `$queryRawUnsafe` with concatenated or template-interpolated user input. This isn't a style preference — treat it as a blocking requirement, same weight as the FK/index verification standards in `PROJECT_PLAN.md`.

## Things to confirm/verify at build time (not hard-coded from memory)

- **Card image printing selection.** The hotlink format is `https://card-images.netrunnerdb.com/v2/{size}/{printing_id}.jpg` (from the original architecture research), but `Card` rows are deduplicated across reprints (per `agent-reports/phase-2.md`), with `printing_ids`/`card_set_ids` arrays sitting in `Card.raw`. Inspect a few real rows' raw JSON to confirm whether those arrays are positionally aligned (so the printing matching `packCode`'s heuristic — "last entry," i.e. original release — can be picked consistently) before writing the image-URL logic. Don't assume the array shape.
- **`pg_trgm` similarity behavior on real data.** Check with actual queries against the already-synced 2054 cards / ~74k decklists whether the default `pg_trgm.similarity_threshold` (0.3) gives sensible results for short card titles and longer decklist names — these may want different thresholds. Tune based on what you actually see returned, not assumed defaults.

## Card browsing

- `/cards` — paginated list (React Server Component, data fetched directly via Prisma/`$queryRaw` — no separate API route needed for this phase, standard Next.js App Router pattern). URL `searchParams` drive state so results are linkable/bookmarkable: `q` (free-text trigram search across `title`+`text`), `faction`, `side`, `type` (plain structured `WHERE` via normal Prisma query — only the free-text part needs raw trigram SQL). Reasonable page size (~30–50).
- `/cards/[code]` — detail page: image (hotlinked, see the printing-selection note above), faction, type/subtypes/keywords, whichever cost/strength/influence/etc. fields are relevant to that card's type, full card text, flavor text, pack/illustrator. Rulings and rules-section display are explicitly Phase 5 — this page shows card data only.

## Decklist browsing

- `/decklists` — paginated list. `searchParams`: `q` (trigram search on `Decklist.name`), optionally an `identity` filter. With ~74k rows, pagination is mandatory, not an afterthought — verify the query plan actually uses the GIN index rather than a sequential scan on a non-trivial dataset this size.
- `/decklists/[id]` — detail page: name, identity (linked to its card detail page), full card list with quantities, each card linked to its own detail page.

## Search query layer

A shared module (e.g. `src/lib/search/`) wrapping the trigram queries as typed functions (`searchCards(params)`, `searchDecklists(params)`), each returning both the page of results and a total count for pagination math. Built once and reused by the page components and by its own tests — not duplicated inline per page.

## Testing

Vitest tests for the search query-building logic: correct filter combination for a given input, correct pagination math, sensible behavior on an empty query string (should list results, not error or return nothing). Decide during the build whether these need a real Postgres connection (likely yes, since the thing being tested is actual trigram ranking behavior, not a pure mapping function like Phase 2/3's fixture-based tests) or can be tested against query-building output alone — whichever gives real confidence without duplicating a full integration-test setup this phase doesn't otherwise need.

## Verification

Follow `PROJECT_PLAN.md`'s "Phase verification standards" in full (typecheck/lint, dev-mode boot+curl, production `build`+`start`+curl as a separate check, schema changes — if any — verified by direct introspection, auth-gated routes unaffected here but still spot-check nothing accidentally became gated, tests passing). Phase-specific additions:

- Real search queries run against the live, already-synced data, with actual result-quality spot checks — does searching "Sure Gamble" return Sure Gamble, does a typo'd search still return something reasonable — not just "the query doesn't error."
- Pagination correctness checked against real row counts (last page has the right remainder; the total-count number matches a direct `SELECT count(*)` with the same filters applied).
- A couple of card image URLs actually fetched and confirmed to return `200`, not just confirmed well-formed.
- `EXPLAIN` on at least the decklist search query, confirming the planner is actually using the GIN trigram index rather than a sequential scan at this row count.

## Explicitly deferred to later phases (not built now)

- Rules-glossary browsing/search UI.
- The right-click rulings/rules context menu.
- Favorites UI, admin UI polish.

## Roadmap beyond Phase 4 (for visibility only — not detailed/decided yet)

- **Phase 5**: rules-glossary browsing UI, right-click rulings/rules integration, favorites, admin UI polish.
