# Phase 8 — Task Report: Decklist Advanced Search & Quick Views

Built against `plans/PHASE_8_PLAN.md`, informed by
`agent-reports/decklist-search-quickviews-research.md`. Followed the plan's own scope boundary
exactly: Popular / Hall of Fame / Hot Topics / Tournaments were **not** built, and Decklist of the
Week's curation claim was **not** built — only the honest, computable proxies (Recent, Recently
updated, Favorited by jinteki users, Posted this week) were, per the plan's Divergence section. No
scope was added beyond the plan.

## What was built, file by file

### 1. Schema migration

- `prisma/schema.prisma` — `Decklist` gains `createdAt DateTime?`, `updatedAt DateTime?`,
  `nrdbUserId String?`, plus `@@index([createdAt])` and `@@index([updatedAt])`.
- **Resolved ambiguity**: the plan flagged `nrdbUserId`'s JSON type ("confirm exact JSON type —
  string vs. number — before choosing Int? vs String?") as needing confirmation at build time.
  Direct `psql` inspection of real synced rows (`jsonb_typeof(raw->'attributes'->'user_id')`)
  showed `"string"` on every sampled row, and the value is NRDB's own **username** (e.g.
  `"Nergaal"`, `"Alsciende"`), not a numeric id — matching `DecklistAttributes.user_id: string |
  null` already typed in `src/lib/nrdb/types.ts`. Used `String?`, confirmed correct.
- Migration: `prisma/migrations/20260808194730_add_decklist_date_and_author_columns/` — pure
  `ADD COLUMN` + two `CREATE INDEX` statements, no drops. Applied via `pnpm prisma migrate dev`.
  (Had to kill four stray `node`/`next dev` processes left running from a prior session first —
  `prisma generate`'s file-rename step was hitting `EPERM` because the old dev server had the
  Windows query-engine `.dll` locked open. Not a bug in this phase's work, just a Windows-specific
  housekeeping step.)
- One-time backfill, run directly via `psql` against the live 74242-row table:
  `UPDATE "Decklist" SET "createdAt" = (raw->'attributes'->>'created_at')::timestamptz, "updatedAt"
  = (raw->'attributes'->>'updated_at')::timestamptz, "nrdbUserId" =
  raw->'attributes'->>'user_id';` → `UPDATE 74242`.
- `src/sync/sync-decklists.ts`'s `mapDecklist()` gains the three field mappings so future
  incremental/full syncs keep the columns current, not just the one-time backfill (per the plan
  and the research report's §5/Recommendation (c)(2) gap).

### 2. `src/lib/search/decklists.ts` — rewritten

The old `searchDecklists()`/`parseDecklistSearchParams()` (word-similarity + ILIKE on `name`,
equality on `identityCode`) are **deleted**, not deprecated. Replaced with the four quick-view tab
queries behind one function, `searchDecklistsByTab({ tab, page, pageSize })`, plus
`parseDecklistTab()`. Each tab is a fixed `Prisma.sql` query:

- `recent` (default) — `ORDER BY "createdAt" DESC NULLS LAST, id ASC`.
- `updated` — same shape, `"updatedAt"` instead.
- `week` — `WHERE "createdAt" >= now() - interval '7 days'`, then the Recent ordering.
- `favorited` — `INNER JOIN "DecklistFavorite"` + `GROUP BY` + `count(f.*) DESC` (the join itself
  is the "has at least one favorite" filter — no separate `HAVING`/minimum-count clause needed).

### 3. `src/lib/search/decklists-advanced.ts` — new

`parseAdvancedDecklistSearchParams()` / `searchDecklistsAdvanced()`, mirroring
`cards-advanced.ts`'s shape. Reuses `likePattern` (imported directly from `./cards`, per the
plan's explicit instruction) for name matching; `nameCondition()` is a small reimplementation of
`cards-advanced.ts`'s private `textCondition()` (that function isn't exported, so it can't be
imported — only `likePattern`/`buildFacetConditions`/`orderColumn` are, and `orderColumn`/
`buildFacetConditions` don't fit this file's genuinely different facet set, so they weren't
reused). Filters: `name` (+fuzzy), `identity`, `faction` (multi, OR), `side`, `pack` (multi, "deck
contains ≥1 card from any selected pack"), `cardsUsed` (multi, AND via one `EXISTS` per card),
`cardsExcluded` (multi, AND via one `NOT EXISTS` per card), `authorId` (equality on `nrdbUserId`).
`order` is a plain `Set(["name","date"])` membership check — no `Popularity`/`Likes`/`Reputation`
value exists anywhere in the type, the parser, or the form.

### 4. `/decklists` — rebuilt (`src/app/decklists/page.tsx`)

No `<form>`, no `name="q"` input, no `name="identity"` select — a tab-link row (Recent / Recently
updated / Posted this week / Favorited by jinteki users) + a results list + `PaginationNav`, plus
a "Search" link to `/decklists/advanced`. Each row shows its tab's sort key (date for
Recent/Updated/Week, favorite count for Favorited) so it's never invisible. Per-tab empty states
are real, distinct copy — `"No decklists have been favorited by jinteki users yet."` for
`favorited` (today's real, non-hypothetical state — 0 rows), `"No decklists have been posted in
the last 7 days."` for `week` (also genuinely 0 rows right now, live-verified).

### 5. `/decklists/advanced` — new form (`src/app/decklists/advanced/page.tsx`)

Structural clone of `/cards/advanced`'s `Row`/page-chrome pattern. Rows: Decklist Name, Matching
(fuzzy checkbox), Identity (`<select>`, "identities in use" query moved here from the old page),
Faction (`FacetPicker`), Side (`<select>`), Pack (`FacetPicker`), Cards used (`FacetPicker`, full
2054-card list), Cards excluded (same, separate field), Author (text, with hint text stating
plainly it's a raw NRDB username, not resolvable to anything else), Sort by (Name/Date only),
Decklists per page. Header links: "Quick views" (→ `/decklists`) / "Home" — named differently from
the card form's "Simple search"/"Home" since there is no simple decklist search left to link to,
per the plan.

**Build-time confirmation the plan asked for**: fetched the rendered page and counted `<option
value=` occurrences — 4352 total (≈2×2054 for the two full-card-list pickers' no-JS `<select
multiple>` fallback, plus pack/faction/identity/etc.), page size 433 KB, server response in
0.2s. FacetPicker's actual filtering is a `useMemo` array `.filter()` over the option list on every
keystroke — trivially fast at 2054 items. **Caveat, stated plainly**: this environment has no
headless browser (per `RESEARCH_AND_VERIFICATION_PRINCIPLES.md`), so real client-side typing
responsiveness in an actual browser was not directly observed — only SSR render cost and the
algorithmic shape of the filter were checked. A human should do a quick visual/interaction pass.

### 6. `/decklists/advanced/results` — new (`src/app/decklists/advanced/results/page.tsx`)

Header "Search results", Edit search / Quick views / Home links, a read-only active-filter summary
line, result count + Sort (Name/Date) + Per page (plain links, no `<form>`), results list,
pagination. **No "Display" group** — decklists have no list/grid concept, per the plan; not
invented. **No shared `decklist-results-controls.tsx` was extracted** — checked per the plan's
explicit instruction ("don't force the extraction"): `/decklists` (quick views) has no per-page/
sort control of its own (its tabs are fixed-sort, plan item 2 doesn't call for one), so there was
never a second consumer to justify a shared component. The Sort/Per-page markup is inlined
directly in the results page instead.

### 7. Link repoints (plan item 6)

- `src/app/page.tsx` — "Browse Decklists" → `/decklists/advanced` (mirrors "Browse Cards" exactly);
  caption below the button row extended to `"Browse Cards / Browse Decklists open their advanced
  search forms."` (the existing layout had room for this without restructuring).
- `src/components/site-header.tsx` — **confirmed unchanged**, per the plan's instruction not to
  repoint something that doesn't need it. It already links to `/decklists`, which now renders the
  quick-views landing page instead of the old hybrid form — verified live (`grep`'d the rendered
  header HTML, link target unchanged).
- `src/app/decklists/page.tsx`'s own `PaginationNav basePath` — unchanged, still `/decklists`, now
  carrying `tab` instead of `q`/`identity`.
- Re-ran the plan's own `grep '"/decklists"' src` at build time: **5** hits, not the plan's cited
  3 (`src/app/page.tsx`, `src/components/site-header.tsx`, `src/app/decklists/[id]/page.tsx`
  ["Back to Decklists", unaffected], `src/app/decklists/page.tsx` [self-reference, unaffected],
  `src/sync/sync-decklists.ts` [a code comment, not a link]) — noted as a real, if harmless,
  drift from the plan's own earlier grep; every hit was individually checked and only the two
  listed above needed a change.

### 8. Deletion (plan item 7)

`searchDecklists()`, `parseDecklistSearchParams()`, and the `DecklistSearchParams`/
`DecklistSummary` types are fully gone from `src/lib/search/decklists.ts` — confirmed via
`grep -n '\bDecklistSearchParams\b|\bDecklistSummary\b|searchDecklists\b|parseDecklistSearchParams'
src` returning zero code hits (only two explanatory comments in `decklists.ts`/
`decklists.test.ts` mention the old names, to explain the deletion — the same style
`cards-advanced.ts`'s own header comment uses for its own predecessor code). The old test file's
content was fully replaced, not patched.

### 9. Tests

- `src/lib/search/decklists.test.ts` — rewritten. `parseDecklistTab` tests (no DB); real-DB tests
  per tab: Recent/Updated ordering correctness (compared against `prisma.decklist.findMany`'s own
  `orderBy`, not a hand-rolled comparator), Recent total matching a direct count, Week's date-window
  boundary matching a direct count, pagination no-overlap. Favorited: an explicit empty-state test
  (0 `DecklistFavorite` rows → 0 results, confirmed against a live `prisma.decklistFavorite.count()`
  of 0) plus a real-fixture test that inserts two real `DecklistFavorite` rows (one against a
  second, throwaway `User` row created and deleted within the test, since the PK is
  `(userId, decklistId)`), asserts the resulting `favoriteCount`s and sort order, then cleans up
  in a `finally` block and re-asserts 0 rows — matching the plan's "insert one real row via the
  existing Server Action... then remove it again" pattern used at the HTTP level too (see
  Verification below), and this project's no-mocking convention.
- `src/lib/search/decklists-advanced.test.ts` — new. Parsing tests (no DB) mirroring
  `cards-advanced.test.ts`'s shape (blank→undefined, multi-facet collection, `fuzzy` strict `"1"`
  check, `order` Set-membership including a rejected-`popularity`/`likes`/`reputation` test and an
  `Object.prototype`-key test, `pageSize` restriction, NUL-byte stripping). Real-DB tests: fuzzy
  on/off on `name` (5 rows plain, 0 rows for a typo with fuzzy off, 58 with fuzzy on — every number
  independently cross-checked live in `psql` before being pinned), faction/side via the identity
  join (12201 anarch / 11093 criminal / 23294 union; 38132 runner / 36110 corp, summing to the live
  total), pack membership (71428 for `core_set`, cross-checked via a direct `EXISTS`-equivalent
  `psql` query), cards-used AND semantics (8471 — `sure_gamble` ∩ `self_modifying_code`, derived
  live via a manual self-join in `psql`, not invented, plus a per-row verification that every
  returned decklist really contains both cards), cards-excluded NOT semantics (`total - containing`
  = 74242 − 30477 = 43765, plus a per-row check no returned deck contains the excluded card),
  author-id equality (41 rows for `nrdbUserId = 'Alsciende'`), and ordering (name/date/default/
  relevance-fallback, plus a repeated "no popularity/likes/reputation" assertion).

**Two test-writing mistakes found and fixed during the run** (both genuine test bugs, not product
bugs):
1. My first draft of the "order=name"/"default order" tests compared the query's output against a
   **JS** `.sort((a,b) => a.localeCompare(b))` of the same names. Postgres' default collation and
   JS's `localeCompare` disagree on where punctuation (`*`, `#`) sorts relative to letters, so this
   failed even though the SQL's `ORDER BY name ASC` was correct. Fixed by comparing against
   `prisma.decklist.findMany({ orderBy: { name: "asc" } })` (a DB-native oracle) instead.
2. My first draft assumed `name=%` (LIKE-escaped) would return 0 rows, copying `cards-advanced.
   test.ts`'s equivalent assertion verbatim. That assumption is true for **card titles** (no card
   title contains a literal `%`, per that file's own comment) but false for **decklist names** —
   93 real decklists contain a literal `%` (e.g. `"100% Real Beef*"`), independently confirmed via
   `psql` (`name ILIKE '%\%%' ESCAPE '\'` → 93). Fixed the test's expected value to 93 with an
   explanation, and added an assertion that it's still far fewer than the full 74242 (i.e.
   escaping is genuinely narrowing, not accidentally matching everything).

## Deliberate divergences, flagged per the plan's own instructions

- **Fuzzy toggle on the decklist name field** — an addition beyond NRDB's own documented form
  (no fuzzy toggle observed there), for consistency with jinteki's established advanced-search
  pattern. Per the plan, noted here explicitly rather than silently.
- **Pack filter semantics** — implemented as "deck contains ≥1 card from any selected pack"
  (`EXISTS` over `DecklistCard`/`Card`). The plan states NRDB's own exact `packs[]` semantics
  (restrict-the-pool vs. contains-a-card-from) could not be confirmed from the research evidence.
  This is a reasonable interpretation for a browsing feature, **not a confirmed match** to NRDB's
  real behavior — stated plainly, not implied as verified.
- **Author filter's low practical utility** — `authorId` searches jinteki's own `nrdbUserId`
  (really NRDB's raw username string) with plain equality; there's no synced NRDB-user directory to
  resolve a display name to it, so the form's hint text says this outright ("A raw NetrunnerDB
  user id, not a display name...").
- **No Popularity/Likes/Reputation of Author sort anywhere** — genuinely absent from the type, the
  parser, and the form, matching the plan's Divergence section and re-confirmed by a live grep of
  both the rendered HTML and the source for those three words (see Verification).

## Verification

All commands below were run for real against this session's live environment (Docker Postgres,
dev server, then a separate production build+start) — not self-reported without evidence.

### Schema / migration

- `docker compose exec postgres psql ... \di | grep -i decklist` → `Decklist_createdAt_idx`,
  `Decklist_name_trgm_idx`, `Decklist_pkey`, `Decklist_updatedAt_idx` all present after the
  migration. **`Decklist_name_trgm_idx` survived** — the standing GIN-index hazard this project has
  hit before, directly reconfirmed, not assumed.
- `\d "Decklist"` — full column/index/FK listing double-checked; three new nullable columns, two
  new btree indexes, no drops.
- Backfill: `SELECT count(*) FROM "Decklist" WHERE "createdAt"/"updatedAt"/"nrdbUserId" IS NULL` →
  **0 / 0 / 0** (all three, not just `createdAt` as the plan's minimum bar required).
- Spot-checked 3 random rows (`ORDER BY random() LIMIT 3`) — `createdAt`/`updatedAt`/`nrdbUserId`
  columns matched `raw->'attributes'->>'...'` exactly on every row.

### Baseline numbers, live at verification time (not the plan's frozen 74242/12201)

- `SELECT count(*) FROM "Decklist"` → **74242** (unchanged from the plan's own baseline — no drift
  this session, but re-derived live, not assumed).
- `SELECT count(*) FROM "DecklistFavorite"` → **0** before and after every test (restored each
  time — see below).
- `anarch`-identity decklists → **12201**, re-derived live via the identity join, matching the
  plan's cited number exactly.

### Typecheck / lint / unit+integration tests

- `pnpm exec tsc --noEmit` → clean, no output.
- `pnpm lint` → clean, no output.
- `pnpm test` → **268 passed, 0 failed** (20 test files) after fixing the two test-authoring
  mistakes described above. Full output tail:
  ```
  Test Files  20 passed (20)
       Tests  268 passed (268)
  ```

### Dev-mode boot + curl

- Killed stray leftover `node`/`next dev` processes from a prior session first (Windows file-lock
  hygiene, unrelated to this phase's correctness).
- `pnpm dev` → `Ready in 293ms`; `GET /` → `200`.
- All six new/changed routes → `200`: `/decklists`, `/decklists?tab=updated`,
  `/decklists?tab=week`, `/decklists?tab=favorited`, `/decklists/advanced`,
  `/decklists/advanced/results`.
- `/decklists`'s rendered HTML: **no** `name="q"` or `name="identity"` (old form genuinely gone).
- `/decklists/advanced` and `/decklists/advanced/results` rendered HTML: **no** occurrence of
  "popularity", "likes", or "reputation" (case-insensitive grep) — the divergence was actually
  built as specified, not partially.
- Favorited-tab empty state: renders `"No decklists have been favorited by jinteki users yet."`
  exactly. Week-tab empty state (today's real 0-row state, `createdAt >= now() - 7d` currently
  matches nothing live): renders `"No decklists have been posted in the last 7 days."` exactly.
- Recent tab, direct `psql` top-5 `ORDER BY "createdAt" DESC NULLS LAST, id ASC` vs. the rendered
  page's first 5 decklist links — **identical ids in identical order**.
- Filter counts, extracted from the rendered page (React streaming payload) and compared against
  independently-derived `psql` numbers, **all exact matches**:
  | Filter | Rendered | Expected (psql) |
  |---|---|---|
  | `faction=anarch` | 12201 | 12201 |
  | `cardsUsed=sure_gamble&cardsUsed=self_modifying_code` | 8471 | 8471 |
  | `cardsExcluded=hedge_fund` | 43765 | 43765 (74242 − 30477) |
  | `side=runner` | 38132 | 38132 |
  | `pack=core_set` | 71428 | 71428 |
  | `authorId=Alsciende` | 41 | 41 |
  | (no criteria) | 74242 | 74242 |
- No `$queryRawUnsafe`/`$executeRawUnsafe` anywhere in the new files (`decklists.ts`,
  `decklists-advanced.ts`, `src/app/decklists/**`) — grepped, zero hits outside a comment
  restating the rule.

### Favorited-by-jinteki-users end-to-end, real Server Action, real session (dev, then repeated separately under production)

Used the real ADMIN user (`unmeel@gmail.com`, already existing per this phase's brief) and one of
its two real, non-expired `Session.sessionToken` rows read directly out of the `Session` table via
`psql` — the same "psql'd out of the Session table" technique Phase 5/6 established. Cookie name
confirmed live as `authjs.session-token` (the header's "Sign out" button appeared once sent,
confirming real authentication, not just a 200).

For each of dev and production, independently:
1. **Empty state**: 0 `DecklistFavorite` rows (today's real, default state) → tab renders the
   explanatory empty-state text.
2. Read the real, bound Server Action's encoded hidden-field names/values (`$ACTION_REF_n`,
   `$ACTION_n:0` = `{"id":...,"bound":"$@1"}`, `$ACTION_n:1` = the bound `decklistId` array) out of
   the rendered decklist detail page HTML — these differ between dev and prod builds (different
   action ids, different field-index numbers), so each was re-derived fresh per environment, not
   reused.
3. **Unauthenticated toggle attempt** (no cookie) → `303 See Other`, `Location: /api/auth/signin`;
   `psql` confirmed **no row created** in either environment.
4. **Authenticated toggle ON** (real session cookie) → `200`; `psql` confirmed a real
   `DecklistFavorite` row (`userId` = the real ADMIN's id, `decklistId` = the target row) — in
   both dev and production.
5. `/decklists?tab=favorited` now renders exactly that one decklist, with `"1 favorite"` shown as
   its sort-key text, and the empty-state message is gone.
6. **Authenticated toggle OFF** (same request, second submission) → `200`; `psql` confirmed the
   row was deleted — table back to 0 rows, in both environments.
7. Final state confirmed clean: `SELECT count(*) FROM "DecklistFavorite"` → **0**; no leftover
   `phase8-test-*` throwaway `User` rows from the automated test suite either
   (`SELECT count(*) FROM "User" WHERE email LIKE '%phase8-test%'` → **0**); `Decklist` row count
   unchanged at **74242**.

### Separate production build + start + curl

- `pnpm build` → `✓ Compiled successfully`, TypeScript pass included, all 19 routes listed
  including the four new/changed decklist routes, all marked `ƒ (Dynamic)` (matches
  `export const dynamic = "force-dynamic"` on every page here, same as every other search page in
  this codebase).
- `pnpm start` → `Ready in 104ms`; `GET /` → `200`.
- Repeated, independently under production (not reused from dev): all six routes → `200`; no old
  `q`/`identity` inputs; Recent-tab top-3 ids matched the same `psql`-derived order; `faction=
  anarch` → 12201; `cardsUsed` AND → 8471; full unauthenticated-reject / authenticated-toggle-on /
  tab-reflects-it / toggle-off / cleanup cycle for the favorite-toggle Server Action (detailed
  above) — all passed identically to dev, confirming this auth-gated write path works under a real
  production build, not just `next dev`'s more permissive defaults.

### Old code fully removed

- `grep -n '\bDecklistSearchParams\b|\bDecklistSummary\b|searchDecklists\b|
  parseDecklistSearchParams' -r src` → only two explanatory-comment hits (in `decklists.ts` and
  `decklists.test.ts`, both narrating the deletion), zero code references.

## Known limitations / left unresolved

- **FacetPicker at ~2054 options**: confirmed responsive at the SSR/render layer (433 KB page,
  0.2s response, `useMemo`-filtered array scan) but **not** interactively tested in a real browser
  (typing latency, keyboard nav at that option count) — this environment has no headless browser,
  per this project's standing limitation. A human should do a quick manual pass on `/decklists/
  advanced`'s Cards used/excluded fields.
- **Pack filter semantics** are a reasonable-but-unconfirmed interpretation of NRDB's real
  `packs[]` behavior (see Divergences above) — not a bug, but worth revisiting if NRDB's own form
  semantics ever become directly observable.
- **Everything the plan explicitly deferred remains deferred**: Popular/Hall of Fame/Hot Topics/
  Tournaments, Format/legality (MWL) filtering, `Decklist.raw`'s `notes` field on the detail page,
  "My decklists"/"My favorites" tabs. None of these were started, per the plan's own "Explicitly
  deferred" section.
- The plan's own `grep '"/decklists"' src` count (3, cited in the plan) didn't match this
  session's re-run (5) — resolved during the build (see "Link repoints" above), flagged here since
  the plan asked for that discrepancy to be confirmed rather than trusted blindly.

## Files touched

- `prisma/schema.prisma`, `prisma/migrations/20260808194730_add_decklist_date_and_author_columns/`
- `src/sync/sync-decklists.ts`
- `src/lib/search/decklists.ts` (rewritten), `src/lib/search/decklists.test.ts` (rewritten)
- `src/lib/search/decklists-advanced.ts` (new), `src/lib/search/decklists-advanced.test.ts` (new)
- `src/lib/search/pagination.ts`, `src/lib/search/types.ts` (comment-only updates, stale references
  to the deleted functions removed)
- `src/app/decklists/page.tsx` (rewritten)
- `src/app/decklists/advanced/page.tsx` (new)
- `src/app/decklists/advanced/results/page.tsx` (new)
- `src/app/page.tsx` (link repoint + caption)

No changes to `.env`, no new environment variables, no `git add`/`commit`/`push` performed — the
working tree is left with these changes present but uncommitted, per the task instructions.

---

## Addendum (2026-08-08): Format filter — build report

Built against `plans/PHASE_8_PLAN.md`'s "Addendum (2026-08-08): Format (card-pool membership)
filter" section — the only authoritative spec for this task. Scope, exactly as specified: a
single-valued `format` filter on `/decklists/advanced`, "every card in this deck (including the
identity) is a member of Format X's card pool," reusing `cards.ts`'s own `format_ids` JSONB-
containment check. **Not built** (per the addendum and the plan's revised "Explicitly deferred"
section, both read first): true MWL/Tournament-Legal deck-wide legality (banned cards, points
budget, `global_penalty`) — that remains out of scope for a dedicated future session.

### What was built, file by file

- **`src/lib/search/decklists-advanced.ts`**
  - `AdvancedDecklistSearchParams` gains `format?: string`.
  - `parseAdvancedDecklistSearchParams()` gains `const format = firstParam(input, "format")?.trim();`
    and `format: format ? format : undefined` in the returned object — single-valued, blank/absent
    → `undefined` (filters nothing), matching every other single-valued field in this parser.
  - `searchDecklistsAdvanced()` gains one condition, placed after `authorId` and before the
    `whereSql` assembly, using the **exact** SQL shape given in the addendum verbatim (not a
    paraphrase):
    ```ts
    if (params.format) {
      conditions.push(Prisma.sql`
        NOT EXISTS (
          SELECT 1 FROM "DecklistCard" dc
          JOIN "Card" cc ON cc.code = dc."cardCode"
          WHERE dc."decklistId" = d.id
            AND NOT ((cc.raw->'attributes'->'format_ids') @> to_jsonb(${params.format}::text))
        )
      `);
    }
    ```
    This is the fourth per-card `EXISTS`/`NOT EXISTS`-over-`DecklistCard` condition in this file
    (after pack, cardsUsed, cardsExcluded) — no new query infrastructure, exactly as the addendum
    said it would be. `DecklistCard` rows include the identity slot (Phase 4's finding), so the
    identity is deck-wide-checked automatically, not as a special case.

- **`src/app/decklists/advanced/page.tsx`**
  - `prisma.format.findMany({ orderBy: { name: "asc" } })` added to the page's existing
    `Promise.all` (same call `/cards/advanced`'s page already makes for its own Format row — no new
    query pattern).
  - One new `Row`, placed directly after the Side row and before the Pack row (confirmed by byte
    offset in the rendered HTML — see Verification), labeled "Format", a plain `<select>` populated
    from `formats`, with `<option value="">Any format</option>` as the unset default (matching
    `/cards/advanced`'s own "Any format" wording) and hint text copied character-for-character from
    `src/app/cards/advanced/page.tsx` line 270 (read directly, not from memory or paraphrase):
    `"Cards in that format's card pool, not just those currently legal in it."`

- **`src/app/decklists/advanced/results/page.tsx`**
  - One line added to the read-only active-filter summary, in the same style every other facet on
    this page already uses: `if (params.format) summaryParts.push(\`Format ${formatCode(params.format)}\`);`
    placed after Side and before Pack, mirroring the form's own row order. (This page builds its
    summary line manually with `formatCode()`, unlike `/cards/advanced/results` which uses a shared
    `describeFacets()`/`formatFacetSummary()` helper — this file never used that helper for any of
    its other facets either, so `format` follows this file's own established pattern rather than
    importing a different one solely for this addendum.)

- **`src/lib/search/decklists-advanced.test.ts`** — three additions, matching the addendum's
  Testing subsection exactly:
  1. Parsing tests (no DB): blank/absent `format` → `undefined` (tested via `{}`, `{format: ""}`,
     `{format: "  "}`), plus a trim test (`"  standard  "` → `"standard"`).
  2. A real-DB test that `?format=standard` returns a strict subset of the unfiltered total,
     cross-checked against a **deliberately differently-shaped** direct query (a `NOT IN` over a
     plain subquery, not a copy of the implementation's correlated `NOT EXISTS`) — an independent
     derivation of the same semantics, per the addendum's explicit "independently written, not
     copy-pasted" instruction.
  3. A real-DB test that a decklist whose *identity alone* fails membership is excluded, using
     `boris_syfr_kovac_crafty_veteran` (an identity confirmed live to lack `"standard"` in its
     `format_ids`, used as the identity on 3 real decklists) — asserts `?identity=boris...&format=
     standard` returns 0 rows even though nothing was said about that identity's non-identity cards.

### Deviation, flagged (test performance, not scope)

One test-writing wrinkle, not a product bug: the addendum's "independently-shaped, not copy-pasted"
oracle query (`NOT IN` over a subquery joining all 1,783,436 `DecklistCard` rows) took **~7.3s** in
`psql`, versus the production code's correlated `NOT EXISTS` at **~74ms** — Postgres can't apply the
same per-decklist short-circuit to the `NOT IN` shape. This isn't a regression in the shipped code
(the fast path is what actually runs in the app); it only affects this one test's own runtime. Fixed
by giving that single test a 15000ms timeout (Vitest's default is 5000ms) rather than weakening the
oracle back into a copy of the implementation, which would have defeated the point of writing it
independently. Flagged here rather than silently raised.

### Verification

All commands below were run for real against this session's live environment (existing dev server
already running on port 3000, confirmed serving jinteki and picking up hot-reloaded changes; a
**separate** production build+start on port 3099, stopped afterward) — not self-reported without
evidence.

**Typecheck / lint / tests**
- `pnpm exec tsc --noEmit` → clean, no output.
- `pnpm lint` → clean, no output.
- `pnpm test` → **272 passed, 0 failed** (20 test files; up from Phase 8's original 268, the +4 new
  format tests).

**Real `?format=standard` count, computed fresh (not copied from anywhere in this addendum, as
instructed)**
- Independently-written `psql` query, same `NOT EXISTS`/JSONB-containment shape as the
  implementation:
  ```sql
  SELECT count(*) FROM "Decklist" d WHERE NOT EXISTS (
    SELECT 1 FROM "DecklistCard" dc JOIN "Card" cc ON cc.code = dc."cardCode"
    WHERE dc."decklistId" = d.id
      AND NOT ((cc.raw->'attributes'->'format_ids') @> to_jsonb('standard'::text))
  );
  ```
  → **73475** (out of 74242 total decklists — a genuine strict subset, 767 decks excluded).
- A second, differently-shaped `psql` query (`NOT IN` over a plain subquery, the same shape used as
  the test oracle) → **73475**, matching exactly.
- Live HTTP, dev (port 3000): `GET /decklists/advanced/results?format=standard&pageSize=30` →
  rendered count **73475** — exact match.
- Live HTTP, **separately** under production (port 3099, fresh `next build` + `next start`):
  `GET /decklists/advanced/results?format=standard&pageSize=30` → rendered count **73475** — exact
  match, independently re-curled, not reused from the dev check.
- Blank `format=` → rendered count **74242** (the live, unfiltered total) in both dev and
  production — confirms the parsing test's "blank filters nothing" guarantee end-to-end, not just
  at the parser-unit level.

**Identity-alone-fails-membership, live**
- `boris_syfr_kovac_crafty_veteran` confirmed via direct `psql` to lack `"standard"` in its
  `format_ids`, and to be the identity on exactly 3 real decklists.
- `GET /decklists/advanced/results?identity=boris_syfr_kovac_crafty_veteran&format=standard` →
  rendered count **0**, "No decklists match this search." — in both dev and production,
  independently re-curled in each.

**Hint text — literal string diff, not "looks similar"**
- Extracted the rendered hint text from both `/cards/advanced` and `/decklists/advanced`'s HTML via
  the same `grep -o` pattern, wrote each to its own file, ran `diff` between them.
- Dev: `diff` → no output, **IDENTICAL**.
- Production (separately, re-fetched fresh, not reused from dev): `diff` → no output, **PROD HINT
  IDENTICAL**.
- Exact text confirmed on both sides: `"Cards in that format's card pool, not just those currently
  legal in it."`

**Row placement — after Side, before Pack**
- Confirmed by byte offset of `adv-side` / `adv-format` / `name="pack"` in the rendered HTML (a
  position-in-document check, not a visual guess): dev — 19796 < 20329 < 21347; production —
  18869 < 19402 < 20420. Format sits between Side and Pack in both, matching `/cards/advanced`'s own
  row order (Side, then Format, then Pack) as instructed.

**No raw-SQL injection risk**
- `grep -n 'queryRawUnsafe|executeRawUnsafe' src/lib/search/decklists-advanced.ts` → only the
  file's pre-existing header comment mentions the term (explaining the rule); the new `format`
  condition, like every other condition in this file, goes through a `Prisma.sql` tagged template.

**Route health**
- All touched/adjacent routes → `200` in both dev and production: `/decklists/advanced`,
  `/decklists/advanced/results`, `/decklists/advanced/results?format=standard`,
  `/decklists/advanced/results?format=`, `/decklists/advanced/results?identity=...&format=standard`.
- `pnpm build` → `✓ Compiled successfully`, TypeScript pass included, all 19 routes listed
  (unchanged route count — this addendum added no new routes, only a param on two existing ones).

**Dataset left unchanged**
- `SELECT count(*) FROM "Decklist"` → **74242** (unchanged). `SELECT count(*) FROM
  "DecklistFavorite"` → **0** (unchanged). This addendum's tests are all read-only against the
  format filter — no fixture rows were inserted or needed cleanup, unlike the original Phase 8
  Favorited-tab tests.

### Files touched

- `src/lib/search/decklists-advanced.ts` (added `format` param, parsing, and query condition)
- `src/lib/search/decklists-advanced.test.ts` (added parsing + 2 real-DB tests)
- `src/app/decklists/advanced/page.tsx` (added Format row + `prisma.format.findMany()` fetch)
- `src/app/decklists/advanced/results/page.tsx` (added Format to the active-filter summary)

No schema/migration changes (this addendum needed none — `format_ids` already lives in `Card.raw`,
reused as-is). No changes to `.env`. No `git add`/`commit`/`push` performed — the working tree is
left with these changes present but uncommitted, per the task instructions.

### Unresolved / left as-is

- Nothing left unresolved within this addendum's own scope — every item in the addendum's Testing
  and Verification subsections was executed with real, independently-computed evidence above.
- True MWL/Tournament-Legal deck-wide legality filtering remains fully deferred, per the plan's
  revised "Explicitly deferred" section — not started, not attempted, per explicit instruction.
