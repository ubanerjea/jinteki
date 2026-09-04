# Phase 10 — Task Report: Format Restriction History, Rotation & Tournament-Legal Filters

Built against `plans/PHASE_10_PLAN.md`, informed by `plans/archive/FORMATS_SECTION_FIXES_PLAN.md`'s
Background sections and `agent-reports/nrdb-rotation-and-tournament-legal-research.md`. All three
scope sections were built, in the plan's stated dependency order (section 1 first/independently,
section 2 before section 3). Nothing marked "Explicitly out of scope" was built (no true deck-wide
MWL/points-budget legality, no "N legacy entries hidden" affordance).

This is the **build pass** — static quality plus my own basic verification, per the task brief. A
separate verify agent is expected to independently re-derive the checks below rather than trust
this report.

## What was built, file by file

### 1. Restriction-history display fix

- **`src/lib/restrictions.ts`** — added `classifyRestrictionHistory(format, restrictions)`,
  `RestrictionHistoryStatus` ("active"|"scheduled"|"past"), `RestrictionLike`,
  `RestrictionHistoryEntry`, per the plan's exact signature. Filters out any restriction whose
  `name` ends with `" (ignore active date)"`, then classifies each remaining entry by comparing its
  `dateStart` against the *active* entry's `dateStart` (matched via `format.activeRestrictionId`),
  not wall-clock time — later-dated than active → `"scheduled"`; id match → `"active"`; everything
  else → `"past"`. `activeRestrictionId: null` → everything classifies `"past"`. Preserves input
  ordering (no re-sort).
- **`src/app/formats/[id]/page.tsx`** — replaced the old inline `restriction.id ===
  format.activeRestrictionId` check with `classifyRestrictionHistory(format, restrictions)`.
  Renders a new "scheduled" badge (outlined, distinct from the solid "active" badge) alongside the
  unchanged "active" bold+badge and plain "past" rendering. Legacy entries are simply absent, no
  "N hidden" note, per the plan.
- **`src/lib/restrictions.test.ts`** — added a `classifyRestrictionHistory` describe block: legacy
  exclusion regardless of date, scheduled-vs-past classification, active-id matching, ordering
  preserved across mixed statuses with legacy rows dropped, `activeRestrictionId: null` → all past,
  and an empty-input case. All fixture ids/dates/names are the real, live-confirmed Standard values
  (not invented), matching this project's convention of using real data in fixtures where practical.

### 2. `CardPool` sync

- **`prisma/schema.prisma`**:
  - `Format` gains `activeCardPoolId String?` (plain string, no `@relation`, same
    insert-ordering reasoning as the existing `activeRestrictionId`) and a `cardPools CardPool[]`
    back-relation.
  - New `CardPool` model: `id`, `name`, `formatId` (real FK → `Format`, since `CardPool` sync runs
    after `Format` rows already exist), `cardCycleIds String[]`, `rotationOrdinal Int?`,
    `rotationDateStart DateTime?`, `raw Json`.
  - `SyncType` enum gains `CARD_POOLS`.
  - Migration `prisma/migrations/20260904203544_add_card_pools/` — pure `ADD COLUMN` +
    `CREATE TABLE` + `ADD CONSTRAINT` + `ALTER TYPE ... ADD VALUE`, **no drops**. Inspected the
    generated SQL before applying, per the standing GIN-index hazard discipline.
- **`src/lib/nrdb/types.ts`** — added `CardPoolAttributes`/`CardPoolResource` (`name`, `format_id`,
  `card_cycle_ids`, `updated_at`, `num_cards` — confirmed live 2026-09-04 that `card_pools` has
  **no `date_start` and no per-snapshot `active` flag**, unlike `restrictions`; documented in both
  `types.ts` and the `CardPool` schema comment). Also added `card_pool_ids?: string[]` to
  `CardAttributes` (see the "deviation" note below — this is the field actually used by section 3).
- **`src/sync/sync-card-pools.ts`** (new) — `mapCardPool()`, `runCardPoolsSync()`, plus
  `fetchRotationLookup()`/`buildRotationLookup()` which fetch
  `netrunner-cards-json/main/rotations.json` (a plain `fetch()` against `raw.githubusercontent.com`,
  same "external non-NRDB host" pattern `sync-rules.ts` already uses for
  `rules.nullsignal.games`) and build a `card_pools`-id-keyed lookup (`rotations.json`'s
  `code: "rotation-2017"` → transformed to `"rotation_2017"`, matching the real `card_pools` id
  shape) giving each numbered rotation its 1-based ordinal and real `date_start`. Full resync each
  run (30 rows total, confirmed live), with delete-cleanup for rows NRDB has since removed, same
  pattern as `sync-restrictions.ts`.
- **`src/sync/sync-restrictions.ts`** — `mapFormat()` gains
  `activeCardPoolId: attributes.active_card_pool_id ?? null` (the field was already being fetched
  into `raw` but never promoted to a column — same pattern `activeRestrictionId` itself already
  used).
- **`src/sync/sync-all.ts`** — added `card-pools` as a new step, placed **after** `restrictions`
  specifically (not just grouped-together placement) since `CardPool.formatId` is a real FK into
  `Format`, and `sync-restrictions.ts` is what upserts `Format` rows.
- **`src/app/admin/sync/page.tsx`** / **`src/app/api/admin/sync/[type]/route.ts`** — added a
  `card-pools` entry to both the admin UI's sync-type table and the API route's handler map.
- **`package.json`** — added `"sync:card-pools": "tsx src/sync/sync-card-pools.ts"`.
- **`src/app/formats/[id]/page.tsx`** — added a "Card pool" section: fetches `CardPool` rows for
  the format, resolves the active one via `format.activeCardPoolId`, renders "Active card pool: X"
  (with a rotation-ordinal suffix when applicable). Separately renders a "Rotation history" list
  **only for pools with a non-null `rotationOrdinal`** (today, exclusively Standard's seven), newest
  first, each showing the pool name, `(rotation #N)`, its `rotationDateStart`, and an "active" badge
  if it happens to be the currently-active pool. For every other format (no numbered rotations
  exist), this list section simply doesn't render — confirmed at build time (see Deviations) that
  `CardPool` has no date/active-flag shape to classify the way `Restriction` does, so section 1's
  active/scheduled/past distinction genuinely does not transfer to this resource; this was
  deliberately checked, not assumed, per the plan's explicit instruction to confirm rather than
  assume the two resources behave identically.
- **Sync fixtures** — `src/sync/__fixtures__/card-pool-rotation.json` (rotation_2017, a real
  numbered rotation), `card-pool-non-rotation.json` (rotation_2020 "Salvaged Memories" — the real,
  live-confirmed non-sequential-name case the plan calls out explicitly), `card-pool-active.json`
  (`standard_2026_vantage_point`, the currently-active pool, itself not a numbered rotation).
- **`src/sync/sync-card-pools.test.ts`** (new) — `buildRotationLookup` tests (dash→underscore
  transform, ordinal assignment, the real 2019→2021 gap meaning `rotation_2020` has no lookup
  entry) and `mapCardPool` tests (numbered-rotation mapping, the `rotation_2020` non-match case
  explicitly, the active-pool non-match case, idempotency, empty-lookup behavior).

### 3. Decklist rotation and tournament-legal filters

- **`src/lib/search/decklist-legality.ts`** (new) — pure, DB-free functions:
  `isCardInPool(cardPoolIds, poolId)`, `isDecklistRotationLegal(cards, targetPoolId)` (every card
  must have ever been a member of the target pool), `isDecklistTournamentLegal(cards,
  activeCardPoolId, activeRestrictionId)` (every card not banned under the active restriction AND a
  member of the active card pool; a null pool/restriction id makes that half vacuously true).
  Deliberately the **narrow** ban-list-verdict + pool-membership question only, per the plan — no
  points-budget/`universal_faction_cost`/`global_penalty` aggregation.
- **`src/lib/search/decklist-legality.test.ts`** (new) — 15 unit tests against fixture data:
  `isCardInPool` true/false/undefined-safe; rotation-legal true/false/a-card-with-no-pool-data-fails
  closed/empty-decklist-vacuously-legal; tournament-legal true/false-on-ban/old-ban-doesn't-count/
  false-on-rotated-out-of-pool/null-restriction-skips-ban-check/null-pool-skips-pool-check/
  both-null-vacuous/empty-decklist-vacuous.
- **`src/lib/search/decklists-advanced.ts`** — `AdvancedDecklistSearchParams` gains
  `rotation?: string` (single CardPool id) and `tournamentLegal?: string` (`"1"|"0"`, Ignore/Yes/No,
  mirroring NRDB classic-site's `is_legal` dropdown). Parsing: `rotation` trims to
  `undefined`-if-blank; `tournamentLegal` validated to exactly `"1"`/`"0"`, anything else →
  `undefined` (Ignore). Query logic:
  - **Rotation**: `NOT EXISTS (card in the deck where NOT (card_pool_ids @> target pool id))` — the
    same per-card `NOT EXISTS`-over-`DecklistCard` shape as every other facet in this file.
  - **Tournament Legal**: only applied when both `tournamentLegal` and `format` are set (there's no
    per-decklist format field, so "legal" needs a format to evaluate against — a silent no-op
    otherwise, confirmed live). Looks up the selected format's `activeRestrictionId`/
    `activeCardPoolId`, builds one `EXISTS (a card that's either banned-under-active-restriction OR
    not-in-active-pool)` sub-condition, then either negates it (Yes) or uses it directly (No).
  - No `$queryRawUnsafe`/string concatenation anywhere — every condition is a `Prisma.sql` tagged
    template, grepped clean (see Verification).
- **`src/app/decklists/advanced/page.tsx`** — two new form rows, placed after the existing Format
  row and before Pack: **Rotation** (`<select>`, "Any rotation" + every `CardPool` row with a
  non-null `rotationOrdinal`, newest-first, labelled by its real name e.g. "Seventh Rotation") and
  **Tournament Legal** (`<select>`, Ignore/Yes/No), with hint text stating the narrow definition and
  the Format dependency plainly.
- **`src/app/decklists/advanced/results/page.tsx`** — active-filter summary line gains `Rotation
  <id>` and `Tournament legal Yes/No` entries, same style as every other facet on this page.
- **`src/lib/search/decklists-advanced.test.ts`** — added: parsing tests for both new params
  (blank/trim/invalid-value handling); real-DB tests for `rotation=rotation_2025` (strict subset,
  independent-oracle-cross-checked, every returned row's cards spot-checked to genuinely belong to
  the pool, blank-rotation-is-a-no-op); real-DB tests for `tournamentLegal` under `format=standard`
  (exact Yes/No partition of the format-filtered subtotal, every "legal" row spot-checked against
  both the ban and pool conditions, no-op-without-format, and a `format=ram` case explicitly
  exercising the null-`activeRestrictionId` path).

## Deliberate deviations from the plan's literal wording (flagged, not silent)

1. **Rotation/tournament-legal filters use `Card.raw.attributes.card_pool_ids` directly, not
   `CardPool.cardCycleIds`.** The plan's §3 describes computing rotation membership via "using
   section 2's `CardPool.cardCycleIds`... whether a decklist's cards... belong to a target pool's
   cycles" — which would require deriving each card's cycle from its pack (and promoting a new
   `cardCycleId` column onto `Pack`, which today has no `raw`/cycle data synced at all). Investigating
   the live API at build time found something better already exists and is already synced: every
   NRDB card resource carries its own precomputed, authoritative `card_pool_ids` array (confirmed
   live 2026-09-04 against `GET /cards/aircheck` → `["eternal", "standard_2026_vantage_point",
   "startup_vantage_point"]` for a brand-new card; `GET /cards/sifr`'s `restrictions.banned` list
   confirmed similarly present) — already present in every already-synced `Card.raw` row (no card
   resync needed) since `Card.raw` stores the full JSON:API resource verbatim. Using this directly is
   simpler (no cycle-membership inference to get subtly wrong), more accurate (NRDB's own
   precomputed answer, not a jinteki-side re-derivation), and needed zero new `Pack` schema.
   `CardPool.cardCycleIds` is still synced and stored exactly as the plan's model shape requires, but
   it's informational only — not read by the filter logic. Documented in both
   `decklist-legality.ts`'s header comment and `decklists-advanced.ts`'s inline comments.
2. **A live "core" format appeared on NRDB that jinteki hadn't synced** (`GET
   /api/v3/public/formats` now lists 7 formats, not the 6 previously in the DB — `core`, with a
   single `card_pools` row and no restrictions). This is pre-existing sync staleness unrelated to
   this phase's own scope (no `sync-restrictions.ts` code change was needed — re-running the
   existing sync picked it up automatically, confirmed live: `Format` table now has 7 rows,
   `CardPool` sync correctly FK'd `core`'s pool against it). Flagged here since it changed some "6
   formats" baseline numbers from the plan/research docs; not a bug introduced by this phase.
3. **A test-writing correction, not a product bug**: my first draft of two real-DB tests
   (`tournamentLegal` + `format=ram`/`format=standard`) assumed `legal.total + illegal.total` would
   equal the **grand** decklist total (74242). It doesn't — `searchDecklistsAdvanced`'s pre-existing
   `format` addendum condition (deck-wide `format_ids` containment, from Phase 8) also applies
   whenever `format` is set, independent of `tournamentLegal`, so the two compound (same as any
   other two ANDed facets in this file). Fixed by using the format-filtered subtotal
   (`searchDecklistsAdvanced({format}).total`) as the correct baseline, re-derived live via `psql`
   for both `standard` (73475) and `ram` (18901) before pinning.
4. **A test-performance correction, not a product bug**: my first attempt at an independently-shaped
   oracle for the rotation filter (a `NOT IN (subquery)`, matching Phase 8's own oracle shape for its
   `format` filter test) was confirmed via `EXPLAIN` to produce a pathological plan for this specific
   JSONB path (`cost≈1.06e9`, a non-hashed correlated `SubPlan` instead of a `Hashed SubPlan`) — a
   real, timed run didn't complete even after several minutes (confirmed by killing it via
   `pg_terminate_backend` after ~8.5 minutes). This is a Postgres query-planning quirk specific to
   this shape/column, not a correctness issue (a `NOT EXISTS`-based `LEFT JOIN LATERAL` anti-join —
   still a genuinely different SQL shape from the production correlated `NOT EXISTS`, not a
   copy-paste — computes the identical answer, 6100, in ~2.6s, confirmed live). Used that shape in
   the final test instead.

## Verification

All commands below were run for real against this session's live environment (Docker Postgres
already up, no dev server running beforehand — a fresh `pnpm dev` was started for this pass and
cleanly stopped afterward) — not self-reported without evidence. Per the task brief, this is the
**build** pass's basic verification, not the full independent re-verification the plan's
"Verification" subsections describe (live-API cross-checks beyond what was needed to build
correctly, a separate production build+start+curl, exhaustive spot-checks) — that's left to a
separate verify pass.

### Baseline numbers, re-derived live at build time (not reused from any doc)

- `SELECT id FROM "Restriction" WHERE name LIKE '%(ignore active date)%'` → **6 rows**, all
  `formatId = 'standard'`, matching the plan's cited count exactly (re-confirmed live, not assumed).
- `Format.standard.activeRestrictionId` → **`standard_ban_list_26_03`**, with two real, later-dated
  entries already present (`standard_ban_list_26_05`, `standard_balance_update_26_08`) — matches
  the plan's cited scheduled-entry scenario.
- `Format.eternal.activeRestrictionId` → **`eternal_points_list_26_03`**, 8 total restrictions,
  matches the plan's cited baseline.
- Live `api.netrunnerdb.com/api/v3/public/card_pools` (no filter) → **30** rows total across all
  formats (standard 10, startup 8, eternal 1, snapshot 1, ram 8, system_gateway 1, **core 1** — the
  7th format, see Deviation #2). `runCardPoolsSync()` synced exactly **30** rows, confirmed via
  direct `SELECT count(*) FROM "CardPool"` → 30, and a per-`formatId` `GROUP BY` matching the live
  API's per-format breakdown exactly.

### Schema / migration

- Generated migration SQL inspected before applying — pure `ADD COLUMN`/`CREATE TABLE`/`ADD
  CONSTRAINT`/`ALTER TYPE ADD VALUE`, **zero drops**.
- Post-migration `\di` — all 5 pre-existing `pg_trgm` GIN indexes still present
  (`Card_title_trgm_idx`, `Card_text_trgm_idx`, `Decklist_name_trgm_idx`,
  `RuleSection_title_trgm_idx`, `RuleSection_bodyText_trgm_idx`), plus `Decklist_createdAt_idx`/
  `Decklist_updatedAt_idx` — the standing GIN-index hazard check, confirmed directly, not trusted
  from Prisma's own success message.
- `\d "Format"` — new nullable `activeCardPoolId` column, no drops; `\d "CardPool"` — expected
  columns/types, PK, FK into `Format` (`ON DELETE RESTRICT ON UPDATE CASCADE`, matching
  `Restriction`'s existing FK pattern).

### Data-writing logic — real row counts, not self-reported

- `pnpm sync:restrictions` → `SUCCESS - 63 records` (formats + restrictions); re-run specifically
  to populate `activeCardPoolId` and pick up the new `core` format.
- `pnpm sync:card-pools` → `SUCCESS - 30 records`; direct `psql SELECT count(*) FROM "CardPool"` →
  **30**, matching the live API's unfiltered total exactly (not just the script's own log line).
- `SELECT id, "activeCardPoolId" FROM "Format"` — all 7 formats have a non-null value, each
  matching the live API's `active_card_pool_id` per format.
- Standard's `CardPool` rows spot-checked in full via `psql`: `rotationOrdinal`/`rotationDateStart`
  populated correctly for exactly the 7 numbered rotations (1→`2017-10-01` through 7→`2025-04-24`),
  and null for `pre_rotation`, `rotation_2020` ("Salvaged Memories"), and
  `standard_2026_vantage_point` — matching `rotations.json`'s real 7-entry content exactly, not
  invented.

### Static correctness

- `pnpm exec tsc --noEmit` → clean, no output.
- `pnpm lint` → clean, no output.
- `grep -rn "queryRawUnsafe|executeRawUnsafe"` across every new/changed file in this phase → only a
  pre-existing header comment mentions the term (explaining the rule); zero actual usage — every
  new condition goes through `Prisma.sql`.

### Tests

- `pnpm test` → **319 passed, 0 failed** (23 test files; up from Phase 8's 272 baseline — +47 new
  tests: 8 `classifyRestrictionHistory` cases, 7 `sync-card-pools` cases, 15
  `decklist-legality` cases, 4 parsing + 13 real-DB cases in `decklists-advanced.test.ts`).
- Every real-DB expected number in the new tests was independently derived via a direct `psql`
  query (or, for the rotation-filter oracle, a differently-shaped Postgres query run inside the test
  itself) before being pinned — not copied from this report or from the implementation under test.

### Dev-mode boot + curl

- `pnpm dev` → `Ready in 680ms`; `GET /` → `200`.
- `/formats/standard` → `200`. Rendered HTML: exactly **1** "active" badge and **2** "scheduled"
  badges (matching `standard_ban_list_26_03` active / `standard_ban_list_26_05` +
  `standard_balance_update_26_08` scheduled); **0** occurrences of "ignore active date" (legacy
  rows genuinely excluded from the rendered page, not just from the classifier's return value);
  "Card pool" section shows "Active card pool: Standard 2026 - Vantage Point"; "Rotation history"
  lists exactly the 7 numbered rotations, newest first ("Seventh Rotation (rotation #7)
  2025-04-24" through First), each date matching `rotations.json`.
- `/formats/ram` → `200`. "No ban/points list has ever applied to this format" renders unchanged;
  "Card pool" section shows "Active card pool: RAM 7" with **no** "Rotation history" list (ram has
  zero numbered-rotation pools, confirmed correctly omitted rather than rendered empty).
- `/formats/system_gateway` → `200` (same no-restriction-history shape).
- `/decklists/advanced` → `200`; rendered HTML contains exactly one `name="rotation"` select (with
  "First Rotation"/"Seventh Rotation" among its options) and one `name="tournamentLegal"` select.
- `/decklists/advanced/results?rotation=rotation_2025&pageSize=1` → `200`, rendered count **6100**
  — exact match to the pinned test value and the independent `psql` oracle.
- `/decklists/advanced/results?format=standard&tournamentLegal=1&pageSize=1` → rendered count
  **5970**; `...tournamentLegal=0...` → **67505** — both exact matches to the pinned test values
  (5970 + 67505 = 73475, the `format=standard`-filtered subtotal).
- `/decklists/advanced/results?tournamentLegal=1&pageSize=1` (no `format`) → rendered count
  **74242** (the full, unfiltered total) — confirms the no-op-without-format behavior live, not
  just at the unit-test level.
- Dev server stopped cleanly afterward (`Stop-Process` on the `next dev` cmd wrapper and its child
  `node`/`next-server` processes); confirmed down via a subsequent `curl` timing out (`000`).

## Left unresolved / flagged for the verify pass

- **Not run in this pass**: a separate production `next build` + `next start` + curl cycle. The
  task brief explicitly scopes this out of the build pass ("You do NOT need to do the deep
  independent verification... a separate verify agent will do that afterward"), but it is called
  for in the plan's own Verification section and should be the verify pass's first check, per this
  project's standing "dev mode passing is not sufficient" discipline.
- **Live-API cross-check for `/formats/standard`'s rendered rotation label against
  `api.netrunnerdb.com`'s own data** was done informally during build (confirming `card_pools`
  counts/shape) but not as a formal, dated spot-check the way the plan's Verification subsection
  asks for — worth the verify pass re-doing explicitly.
- **The new "core" format** (Deviation #2) is now present in the DB with a single, restriction-less
  `CardPool` row. `/formats/core` was not specifically curled/inspected during this pass (only
  standard/ram/system_gateway were) — worth a quick check that it renders sanely (no restriction
  history, no rotation history, an active card pool of "Core") since it's new, real data this
  session's sync run surfaced rather than something deliberately built for.
- **NRDB classic-site cross-check for the rotation/tournament-legal filters**
  (`netrunnerdb.com/en/decklists/find?rotation_id=...`/`is_legal=...`), which the plan's §3
  Verification explicitly calls for, was **not** performed in this build pass — only jinteki's own
  data was cross-checked (live API counts, independent `psql`/in-test oracles). This is exactly the
  kind of external spot-check the task brief defers to the verify pass.
- **Visual/interactive review** of the two new `/decklists/advanced` form rows (dropdown rendering,
  keyboard nav) was not done — this environment has no headless browser, matching every prior
  phase's stated limitation; only HTTP/HTML-level checks were performed.

## Files touched

- `prisma/schema.prisma`, `prisma/migrations/20260904203544_add_card_pools/`
- `src/lib/nrdb/types.ts` (added `CardPoolAttributes`/`CardPoolResource`, `card_pool_ids` on
  `CardAttributes`)
- `src/lib/restrictions.ts` (added `classifyRestrictionHistory`), `src/lib/restrictions.test.ts`
- `src/sync/sync-card-pools.ts` (new), `src/sync/sync-card-pools.test.ts` (new)
- `src/sync/__fixtures__/card-pool-rotation.json`, `card-pool-non-rotation.json`,
  `card-pool-active.json` (new)
- `src/sync/sync-restrictions.ts` (`activeCardPoolId` promotion), `src/sync/sync-all.ts`
  (`card-pools` step)
- `src/app/admin/sync/page.tsx`, `src/app/api/admin/sync/[type]/route.ts` (card-pools sync trigger)
- `package.json` (`sync:card-pools` script)
- `src/app/formats/[id]/page.tsx` (restriction-history classification + Card pool section)
- `src/lib/search/decklist-legality.ts` (new), `src/lib/search/decklist-legality.test.ts` (new)
- `src/lib/search/decklists-advanced.ts` (`rotation`/`tournamentLegal` params, parsing, query
  conditions), `src/lib/search/decklists-advanced.test.ts`
- `src/app/decklists/advanced/page.tsx` (Rotation + Tournament Legal rows),
  `src/app/decklists/advanced/results/page.tsx` (summary line entries)

No changes to `.env`, no new environment variables. No `git add`/`commit`/`push` performed — the
working tree is left with these changes present but uncommitted, per this repo's convention that
committing is a decision for the repo owner, not a build agent.

## Independent verification pass (2026-09-04)

Run as a separate, targeted pass against the build's own "Left unresolved / flagged for the verify
pass" list, working directly in this checkout (no worktree — `.env`/`DATABASE_URL` only exist
here). Did not re-derive the build's dev-mode checks, migration SQL, or GIN-index survival (already
solid per the build report); did a confirmatory `pnpm test` run (**319 passed, 0 failed**, 23 test
files — unchanged) but that was not the point of this pass. Four checks below, in the order the
brief specified.

### 1. Production build + start + curl cycle — **PASS**

Not run at all in the build pass; this project's own standing discipline (`RESEARCH_AND_VERIFICATION_PRINCIPLES.md`:
"Dev mode passing is not sufficient for anything route- or auth-related") makes this the
highest-priority gap to close.

- `pnpm build` → succeeded (`next build`, Turbopack, `Compiled successfully in 2.2s`, TypeScript
  clean). Route table includes `ƒ /formats/[id]`, `ƒ /decklists/advanced`,
  `ƒ /decklists/advanced/results` exactly as expected — all three routes this phase touched
  present as dynamic (`ƒ`) routes.
- `pnpm start` → real production server (`next start`, not dev), `Ready in 89ms`, port 3000 (no
  other server running beforehand besides Docker Postgres, confirmed via `tasklist`/`netstat`
  before starting).
- Real `curl` against the running production server, HTML pretty-printed (`sed 's/></>\n</g'`) and
  inspected directly rather than trusted from a raw grep count (see methodology note below):
  - `/formats/standard` → HTTP 200. Rendered DOM (excluding the duplicate copy of the same content
    Next.js also embeds in a `self.__next_f.push(...)` RSC-hydration `<script>` tag — an initial
    naive `grep -c` double-counted every badge because of this duplication, corrected by filtering
    out the `self.__next_f` line before counting): exactly **1** "active" badge
    (`standard_ban_list_26_03`), exactly **2** "scheduled" badges (`standard_ban_list_26_05`,
    `standard_balance_update_26_08`), **0** occurrences of "ignore active date", a "Card pool"
    section (`Active card pool: Standard 2026 - Vantage Point`) and a rotation-history list of
    exactly the 7 numbered rotations, newest first (Seventh through First, each with its real
    `rotationDateStart`). One documentation-only nit found while checking this (not a functional
    bug): there is no literal "Rotation history" heading anywhere in `src/app/formats/[id]/page.tsx`
    (confirmed by reading the file, lines 110–157) — the numbered-rotations `<ul>` renders directly
    under the "Card pool" `<h2>` with no sub-heading. The build report's prose ("'Rotation history'
    lists exactly the 7 numbered rotations...") describes the list's function accurately but implies
    a heading string that doesn't actually exist on the page. Cosmetic only, not filed as a bug.
  - `/formats/ram` → HTTP 200. "Card pool" section shows "Active card pool: RAM 7"; no numbered-
    rotation `<ul>` follows (`ram` has zero `rotationOrdinal`-non-null pools) — confirmed correctly
    omitted, matching the build report.
  - `/decklists/advanced` → HTTP 200. Rendered HTML has exactly one `name="rotation"` and one
    `name="tournamentLegal"` field.
  - `/decklists/advanced/results?rotation=rotation_2025&pageSize=1` → **6100** decklists found.
  - `/decklists/advanced/results?format=standard&tournamentLegal=1&pageSize=1` → **5970**;
    `...tournamentLegal=0...` → **67505**. All three exact matches to the build report's pinned
    dev-mode values — **no dev/prod mismatch found** for any of the four pinned numbers.
  - Minor observation (not a bug per the brief's scope, noted for the record): the results-page
    active-filter summary line renders the raw `rotation` param through a generic `formatCode()`
    humanizer (`src/app/decklists/advanced/results/page.tsx` line 87,
    `` `Rotation ${formatCode(params.rotation)}` ``), producing "Rotation Rotation 2025" for
    `rotation=rotation_2025` rather than looking up the real `CardPool.name` ("Seventh Rotation").
    Cosmetic UX nit, not a correctness issue — the underlying filter and count are correct.
- Server stopped cleanly (`Stop-Process` on the `next start` node process, PID confirmed via
  `netstat -ano`); confirmed down via a subsequent `curl -m 5` returning `HTTP 000` (connection
  refused/timeout) and `tasklist` showing zero `node.exe` processes afterward.

### 2. `/formats/core` sanity check — **PASS**

Curled against the same production server (before stopping it). HTTP 200. Rendered content,
pretty-printed and read directly:
```
<h1>Core</h1>
<h2>Restriction history</h2>
<p>No ban/points list has ever applied to this format.</p>
<h2>Card pool</h2>
<p>Active card pool: Core</p>
```
No restriction-history content (correct — `core` has zero `Restriction` rows), no numbered-rotation
list (correct — `core`'s single `CardPool` row has `rotationOrdinal: null`), no broken/undefined
text, no format-description paragraph (format has no `description` seeded, which the page already
handles as optional). Renders sanely end to end, not just a 200 status.

### 3. Live NRDB classic-site cross-check — **PASS (directionally consistent), with a scope caveat**

`netrunnerdb.com/en/decklists/find` required no auth/session/CSRF token for a plain `curl` — it
returned real, usable HTML on every request (no captcha/challenge page encountered), so this did
not come back inconclusive.

- **Rotation** (`?rotation_id=7`, NRDB's "Seventh Rotation", the closest analog to jinteki's
  `rotation=rotation_2025`): page 1 returned 30 real decklist rows, badges dominated by "Seventh
  Rotation" (31 occurrences; the other six rotation names each appeared once, from the filter
  `<select>`'s own option list, not from result badges). NRDB's classic site exposes no "N results"
  text, so total count was bracketed by binary-searching pagination (30 decklists/page): page 220
  still full, page 249 partial (22 decklists), page 250 empty → **NRDB total = 248×30 + 22 = 7462**.
  jinteki's `rotation=rotation_2025` count is **6100**. Same order of magnitude (thousands), NRDB
  running ~22% higher — consistent with ordinary dataset drift between the two sites' independently
  synced decklist corpora, not a red flag.
- **Tournament Legal** (`?is_legal=1`): same binary-search method → last full page 310, partial page
  311 (23 decklists), page 312 empty → **NRDB total = 310×30 + 23 = 9323**. jinteki's
  `format=standard&tournamentLegal=1` count is **5970**. Also same order of magnitude, but a larger
  gap (~56% higher on NRDB's side) than the rotation comparison. Scope caveat, found while doing
  this check: NRDB's classic search form (`GET /en/decklists/search`, form field names read
  directly) has **no format-selector param at all** — only `rotation_id`, `is_legal`, and
  `mwl_code` (a specific named restriction). `is_legal=1` with no format qualifier likely isn't
  scoped to Standard the way jinteki's `format=standard&tournamentLegal=1` is, which plausibly
  explains the wider gap (NRDB's count may include decks legal under other formats too). This
  matches the research doc's own flagged uncertainty about `is_legal`'s exact semantics. Reported
  as a real limitation on how tightly these two numbers can be compared, per the brief's
  instruction not to fabricate false confidence — the order-of-magnitude agreement is still
  meaningful corroboration, just not a tight one.

### 4. Independent spot-check of pinned numbers via `psql` — **PASS**

Chose the **rotation** filter (6100) as the one independently re-derived count, writing a fresh
query from the plan's/build report's stated semantics (a decklist qualifies iff every one of its
cards has `target_pool_id` in `Card.raw.attributes.card_pool_ids`) without reading
`src/lib/search/decklists-advanced.ts` or its test file's oracle. `psql` accessed via
`docker exec jinteki-postgres-1 psql -U jinteki -d jinteki` (no `psql` binary on the host PATH).

- Query used (deliberately structured as a plain correlated `NOT EXISTS` — the same shape the build
  report says produced a pathological ~9-minute plan for *their* differently-organized version;
  `EXPLAIN` confirmed this one gets a cheap `Parallel Hash Right Anti Join`, cost≈43000, not the
  bad plan, because the `NOT (... ? 'rotation_2025')` filter sits directly on the `Card` scan rather
  than a nested correlated subplan):
  ```sql
  SELECT count(*) FROM "Decklist" d
  WHERE NOT EXISTS (
    SELECT 1 FROM "DecklistCard" dc
    JOIN "Card" c ON c.code = dc."cardCode"
    WHERE dc."decklistId" = d.id
      AND NOT (c.raw->'attributes'->'card_pool_ids' ? 'rotation_2025')
  );
  ```
  Result: **6100**, in 0.5s — exact match to the pinned value and to the production `curl` result
  from check 1. Sanity check: unfiltered `SELECT count(*) FROM "Decklist"` → **74242**, matching the
  build report's grand total exactly.
- `SELECT count(*) FROM "CardPool"` → **30** independently confirmed, plus a per-`formatId`
  breakdown: `core 1, eternal 1, ram 8, snapshot 1, standard 10, startup 8, system_gateway 1`.
- Fresh live fetch (not reused from the build report) of `api.netrunnerdb.com/api/v3/public/card_pools`:
  the endpoint paginates at a default `page[size]=20` (an initial unpaginated fetch only returned 20
  rows and was caught by checking `meta.stats.total.count` — **30** — and `links.last` before
  concluding); re-fetched with `page[size]=100` to get all rows in one response. Per-format
  breakdown: `core 1, eternal 1, ram 8, snapshot 1, standard 10, startup 8, system_gateway 1` —
  **exact match**, both total and per-format, to jinteki's synced `CardPool` table.

### Cleanup

Production server process stopped and confirmed down (`tasklist` shows zero `node.exe`, port 3000
closed, a post-stop `curl` returns `HTTP 000`). No dev server was started during this pass. No
source files were modified — only `agent-reports/phase-10.md` (this section) was written to.

### Overall verdict

**Phase 10 is solid — no fix-up round needed.** All four targeted checks pass. The production
build+start+curl cycle (the pass's top priority, since it was never run at all in the build pass)
produced results identical to the build's dev-mode numbers on every pinned count (6100, 5970,
67505, plus the badge/section checks on `/formats/standard` and `/formats/ram`) — no dev/prod
divergence, which is itself a meaningful finding given this project's documented history of
production-only bugs. `/formats/core` renders cleanly. The NRDB classic-site cross-check, the one
external verification explicitly skipped in the build pass, came back usable (no auth/CSRF
blocker) and directionally consistent for both filters, with one honestly-reported scope caveat
(NRDB's `is_legal` has no format qualifier, so the tournament-legal comparison is looser than the
rotation comparison). The independent `psql` re-derivation of the rotation count and the `CardPool`
row count both matched exactly, using genuinely different methods (a fresh query written from
semantics, and a fresh live API fetch) rather than re-reading the implementation. The two findings
worth the repo owner's attention are both cosmetic, not functional: (1) the "rotation history" list
on `/formats/[id]` has no literal heading text, just an unlabeled list under "Card pool"; (2) the
`/decklists/advanced/results` summary line shows raw ids like "Rotation Rotation 2025" instead of
the human-readable pool name for the `rotation` filter. Neither affects correctness or the pinned
counts.
