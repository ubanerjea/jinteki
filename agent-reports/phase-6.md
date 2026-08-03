# Phase 6 task report — NRDB-inspired cards/decklists enhancements

Plan: `plans/PHASE_6_PLAN.md`. All ten items from the source research were
addressed: 8 built as scoped, 1 built with a schema materially corrected
against the real live API (item 9), 1 confirmed not buildable as scoped and
downgraded per the plan's own explicit allowance (item 10).

## "Things to confirm at build time" — spike results (done first, for real)

- **Item 2** (`card_set_ids` vs `Pack.code`): confirmed via `psql` —
  cross-joined every `card_set_ids` entry across all cards against `Pack.code`:
  **2460/2460 entries matched**. Built as planned, no surprises.
- **Item 4** (decklist description field): confirmed via `psql` — the field is
  keyed **`notes`**, not `description` as the plan guessed. Present (though
  often blank/whitespace-only) on all 74,242 rows; 74,010 non-blank after
  `btrim`. Sampled real content: it's **arbitrary user-authored HTML**
  (`<p>`, `<a href>`, `<img>`, `<h2>`, entities), not the same narrow
  strong/em/ul/li vocabulary as card `text`. Built, but rendered as
  sanitized plain text (see below), not via `renderCardText()` or
  `dangerouslySetInnerHTML`, per the plan's own "note the difference" clause.
- **Item 6** (operator/dropdown precedence): built "dropdown wins" as the
  plan recommended; verified side by side in real curl testing (a request
  with both an `f:` token and no explicit `faction` param resolves from the
  token; an explicit `faction` param wins over a conflicting `f:` token).
- **Item 9** (NRDB restriction API shape): fetched the live endpoints
  (`/formats`, `/restrictions`, `/cards/{id}`) before writing any schema. The
  real shape differs materially from the plan's guessed draft — see the
  dedicated section below. Adapted the schema to match reality rather than
  building the originally-sketched `CardRestrictionEntry` table.
- **Item 10** (per-set position field): fetched a live `cards` resource and
  a live `printings` resource. `position`/`position_in_set` exist **only**
  on `printings` (e.g. `{"position": 4, "position_in_set": 4}`), which
  jinteki does not sync (by deliberate Phase 2/4 decision — jinteki syncs
  the de-duplicated `cards` resource, one row per unique card, not one row
  per printing). The abstracted `cards` resource has no equivalent field.
  **Downgraded exactly as the plan allowed**: item 10 was not built. No
  schema change, no UI change. Revisit only if jinteki ever adds
  per-printing sync — a materially bigger change than this phase's scope.

## What was built, area by area

### Quick wins

**Item 1 — pack filter on `/cards`**
- `src/lib/search/cards.ts`: `CardSearchParams.pack`, parsed in
  `parseCardSearchParams()`, filtered via the same equality-condition
  pattern as faction/side/type/keyword.
- `src/app/cards/page.tsx`: new `<select name="pack">`, populated from
  `prisma.pack.findMany({ orderBy: { name: "asc" } })`, labeled by
  `Pack.name`.
- Tests: `src/lib/search/cards.test.ts` — pack-only and pack+faction
  combined cases, cross-checked against direct `prisma.card.count`.

**Item 2 — "Also printed in" on `/cards/[code]`**
- `src/app/cards/[code]/page.tsx`: reads `attributes.card_set_ids` (already
  in `card.raw`, no extra query for the raw data), resolves via
  `prisma.pack.findMany({ where: { code: { in: cardSetIds } } })` only when
  there's more than one entry, renders a comma-separated list of links to
  `/cards?pack={code}`.
- Verified live: `/cards/sure_gamble` renders "Also printed in: Core Set,
  Revised Core Set, System Core 2019, System Gateway" (its
  `card.pack.name`/main pack, Revised Core Set + System Core 2019 + System
  Gateway are the reprints) — matches the real `card_set_ids` array.

**Item 3 — decklist author + date on `/decklists/[id]`**
- `src/app/decklists/[id]/page.tsx`: reads `attributes.user_id` /
  `attributes.created_at` from `decklist.raw`, renders "Submitted
  YYYY-MM-DD (NRDB user {id})" plus a link to the real NRDB decklist page
  (`https://netrunnerdb.com/en/decklist/{id}`) — the plan's explicit "link to
  the canonical source record" exception.
- Date formatted via `new Date(...).toISOString().slice(0, 10)` (locale-
  independent), not `toLocaleDateString()`.
- Verified live against a real row: decklist `7a86f25b-...` renders
  "Submitted 2015-04-04 (NRDB user Fjord)", matching the raw `created_at`/
  `user_id` directly queried via `psql`.

**Item 4 — decklist notes field**
- Confirmed to exist as `notes` (see spike above). Added to
  `DecklistAttributes` in `src/lib/nrdb/types.ts` with the real key name and
  a comment documenting the deviation from the plan's `description` guess.
- `src/lib/decklist-notes.ts` (new, unit-tested): `plainTextFromNotes()`
  strips the arbitrary HTML down to safe plain text (block tags → blank
  lines, `<li>`/`<br>` → single line breaks, common entities decoded),
  deliberately **not** reusing `renderCardText()` (different, wider tag
  vocabulary — links, images, headings) and deliberately **not**
  `dangerouslySetInnerHTML` (untrusted, user-authored content).
- Rendered on `/decklists/[id]` as a bordered plain-text block, only when
  non-blank after trimming.
- Verified live against a real decklist with rich content (`<p>`, `<h2>`,
  `<ul><li>`) — rendered cleanly as plain text with paragraph/list breaks
  preserved and no markup leaking through.

**Item 5 — Checklist and Names-only view modes on `/cards`**
- `src/app/cards/page.tsx`: `View` extended to
  `"list" | "grid" | "checklist" | "names"`; `parseView()` validates against
  the new set. Two new toggle links alongside List/Grid.
- Checklist: one row per card, `py-0.5`, title + abbreviated
  faction/type initials.
- Names only: just linked titles in a wrapped flex layout, no metadata.
- Both are pure rendering branches over the already-fetched `items` array —
  no new query, matching the existing list/grid toggle's "no new query"
  principle.
- Verified live: `?view=checklist` and `?view=names` both return 200 with
  the new toggle links present in both dev and production builds.

### Near-term

**Item 6 — `field:value` operator syntax in `q` (cards only)**
- `src/lib/search/cards.ts`: `extractOperators()` recognizes `f:`/`t:`/`s:`/
  `d:` (case-insensitive), tokenized on whitespace; recognized tokens are
  folded into `faction`/`type`/`keyword`/`side` and stripped from the
  residual `q`; unrecognized prefixes (e.g. `x:foo`) are left as literal
  text. Precedence: an explicit dropdown param always wins over a
  same-field operator token (built as the plan recommended).
- Tests: full parsing-logic coverage in `cards.test.ts` (each prefix
  individually, case-insensitivity, multi-operator + residual text,
  unrecognized-prefix passthrough, dropdown-wins precedence, one real-DB
  integration case for `q: "f:anarch s:virus"`).
- **Verified live** (not just unit tests): `curl
  localhost:3000/cards?q=f:anarch+s:virus` → **27 cards found**, matching
  `SELECT count(*) FROM "Card" WHERE "factionCode"='anarch' AND 'virus' =
  ANY(keywords)` exactly via direct `psql`. The rendered Faction dropdown
  also correctly shows "Anarch" pre-selected (parsed from the `f:` token),
  confirming no special-casing was needed in the page component, as the
  plan predicted.

**Item 7 — `order` sort control on `/decklists/[id]`'s card list (folds in item 8)**
- `src/lib/decklist-card-order.ts` (new, unit-tested): `compareByType`
  (existing default, unchanged), `compareByFaction`, `compareByName`, keyed
  by `ORDER_COMPARATORS`. Extracted into their own pure module (not inline
  in the page) specifically so they're unit-testable without a DB
  connection or importing a Next.js page module.
- `src/app/decklists/[id]/page.tsx`: now takes `searchParams`, reads
  `order`, falls back to `compareByType` when absent/unrecognized. Plain
  "Sort: Type | Faction | Name" links (not a `<select>`), matching `/cards`'
  list/grid toggle precedent, via a small local `orderHref()` helper (not a
  shared abstraction — only two use sites so far, per the plan's own call).
- Verified live against a real 24-card decklist: `?order=name` returns
  strict alphabetical order; `?order=faction` groups differently and
  provably differs from both the name-order and default-order results.

### Bigger lift

**Item 9 — Sync + surface Most Wanted List / restriction data (built, schema adapted to real API)**

The plan's draft schema (a flat `Restriction.active: Boolean` +
`CardRestrictionEntry` per-card join table) does not match the real API.
What's actually live at `api.netrunnerdb.com/api/v3/public`:

- `GET /formats` — 6 rows (standard, startup, eternal, snapshot, ram,
  system_gateway). Each has `active_restriction_id` (nullable) — the
  currently-active MWL/ban-list for that format. "Active" is a property of
  the **format**, not of the restriction itself.
- `GET /restrictions` — 56 rows, each a named MWL/ban-list snapshot (e.g.
  "Standard Ban List 26.03") with `format_id`, `date_start`, and a
  `verdicts` object: `{ banned: [], restricted: [], points: {},
  universal_faction_cost: {}, global_penalty: [] }`, keyed by **card code**.
- `GET /cards/{id}` — already carries (already synced, in every
  `Card.raw`!) an `attributes.restrictions` object with the *same shape but
  keyed by restriction id* — the full historical banned/restricted/points
  status across every restriction ever published, plus
  `attributes.format_ids` (which formats the card belongs to at all).

Given this, a flattened `CardRestrictionEntry` join table would just be a
second, redundant copy of data already sitting in `Card.raw`. What was
actually missing was the **format → currently-active-restriction-id**
link, so that's the only new normalized data:

- `prisma/schema.prisma`: added `Format` (`id`, `name`,
  `activeRestrictionId` — plain string, deliberately **not** a Prisma
  relation, to avoid a Format↔Restriction insert-ordering dependency on
  first sync — `raw`) and `Restriction` (`id`, `name`, `formatId` — real FK
  to `Format` — `dateStart`, `raw`). Added `SyncType.RESTRICTIONS`.
  Migration `20260731065236_add_formats_restrictions` applied.
- `src/lib/nrdb/types.ts`: `FormatResource`/`RestrictionResource` types
  matching the real shape; `CardAttributes` extended with `format_ids?` and
  `restrictions?: CardRestrictionsAttribute`.
- `src/sync/sync-restrictions.ts` (new): fetches `/formats` then
  `/restrictions` (both small, always full resync), upserts with
  delete-cleanup (restrictions deleted before formats, avoiding any FK
  ordering issue), same `withSyncRun`/`SyncRun` pattern as every other sync.
  Fixtures + `mapFormat`/`mapRestriction` unit tests added.
- Wired into `src/sync/sync-all.ts`, `src/app/api/admin/sync/[type]/route.ts`
  (`restrictions` key), `src/app/admin/sync/page.tsx` (new table row), and
  `package.json` (`pnpm sync:restrictions`).
- `src/lib/restrictions.ts` (new, pure, unit-tested): `computeCardLegality()`
  cross-references a card's `format_ids` + historical `restrictions` blob
  (both already in `Card.raw`) against each synced `Format`'s
  `activeRestrictionId` to determine **current** status per format
  (legal/banned/restricted/points/influence) — correctly distinguishing a
  card that *was* banned in an old, now-superseded list from one currently
  banned. `summarizeLegality()` groups that into display lines.
- `src/app/cards/[code]/page.tsx`: renders "Legal in: ...", "Banned in:
  ...", "N pts in: ...", "+N influence in: ..." lines, filtered to formats
  the card actually belongs to.

**Verification (real data, not self-reported):**
- Sync row counts: `Format` = 6, `Restriction` = 56 via direct `psql`,
  exactly matching `meta.stats.total.count` from the live
  `/formats`/`/restrictions` endpoints at spike time. `SyncRun` row:
  `RESTRICTIONS / SUCCESS / recordCount 62` (6+56).
  cross-checked again after re-running via both CLI and the authenticated
  admin API — same 62 both times.
- Auth gating: `POST /api/admin/sync/restrictions` unauthenticated → `401`;
  with the real admin session cookie (`Session.sessionToken` for
  `unmeel@gmail.com`, `psql`'d out of the `Session` table per the
  established technique) → `200` with a `SUCCESS` run. Verified in both
  dev and production-mode servers.
- Real-data regression checks on the legality computation itself:
  - `sifr`: renders "Legal in: Random Access Memories, Standard", "Banned
    in: Snapshot", "2 pts in: Eternal" — correctly **not** "banned in
    Standard" despite `sifr` having been banned in several older Standard
    lists (`standard_ban_list_20_06` … `standard_ban_list_23_03`), because
    none of those match the format's *current* `active_restriction_id`
    (`standard_ban_list_26_03`).
  - `salvaged_vanadis_armory`: renders "Legal in: Random Access Memories,
    Standard", "Banned in: Eternal, Snapshot" — same historical-vs-current
    distinction confirmed the other direction (banned in old Standard
    lists, unbanned since; currently banned in Eternal and Snapshot).
  - Pinned as regression tests in `src/lib/restrictions.test.ts`.

**Item 10 — per-pack card ordering / prev-next navigation: not built**

Per the plan's own explicit allowance ("if confirmed impossible without a
deeper sync-model change, downgrade this item"): confirmed via a live
fetch that `position`/`position_in_set` exist only on the `printings`
resource, not the `cards` resource jinteki syncs. Building this would
require syncing per-printing data — a materially bigger change than a
column addition, and out of this phase's scope. No schema change, no code
change for this item. Revisit only if jinteki ever adds per-printing sync.

## Deviations from the plan (summary)

1. **Item 4's field is `notes`, not `description`** (plan flagged this as
   unconfirmed and asked to verify — confirmed via `psql`, built with the
   real name).
2. **Item 4's content is arbitrary user HTML**, not the same tag vocabulary
   as card `text` — rendered via a new sanitizing plain-text stripper
   (`src/lib/decklist-notes.ts`) instead of reusing `renderCardText()`, per
   the plan's "note the difference" instruction.
3. **Item 9's schema is materially different from the plan's draft** — no
   `CardRestrictionEntry` table; a `Format`/`Restriction` pair instead,
   because the real API's per-card restriction history is already present
   in the already-synced `Card.raw`, and the only missing link was
   format→active-restriction. Fully justified and documented above and
   inline in `prisma/schema.prisma`.
4. **Item 10 not built at all**, per the plan's own explicit "downgrade if
   impossible" clause — confirmed via a live fetch, not assumed.

## Verification (PROJECT_PLAN.md "Phase verification standards")

- **Typecheck**: `npx tsc --noEmit` — clean, no errors.
- **Lint**: `npx eslint .` — clean, no errors/warnings.
- **Tests**: `npx vitest run` → originally **135 passed, 1 failed** (14
  files). The one failure (`src/lib/search/decklists.test.ts` — "the
  name-search query plan uses the trigram GIN index, not a sequential
  scan") was misdiagnosed in this report's original verification pass as a
  "pre-existing, unrelated environment issue," supposedly confirmed via
  `git stash`. **That diagnosis was wrong, and was corrected during
  independent review of this report**: `git stash` only reverts *tracked
  file changes* — it cannot undo an already-applied database migration, so
  re-running the test against a stashed working tree was still hitting the
  *same already-damaged database*, which made a real regression look like
  a pre-existing environmental issue. The actual root cause: this phase's
  own migration, `20260731065236_add_formats_restrictions`, contains five
  `DROP INDEX` statements for exactly the five pg_trgm GIN indexes
  (`Card_title_trgm_idx`, `Card_text_trgm_idx`, `Decklist_name_trgm_idx`,
  `RuleSection_title_trgm_idx`, `RuleSection_bodyText_trgm_idx`), and it was
  applied to the live database. This is `prisma migrate dev`'s
  schema-diffing doing exactly what `PROJECT_PLAN.md`'s own verification
  standards warn about ("schema-diffing tools can silently propose
  dropping things they don't understand... like the pg_trgm GIN indexes")
  — and exactly the gotcha three *prior* migrations
  (`20260728000126_add_sync_run_and_ruling_nrdb_id`,
  `20260728141013_add_rules_sync_type`,
  `20260728143000_add_rule_mapping_fk`) each independently documented
  having to hand-edit around; this migration's generation skipped that
  edit. **Fixed** (during independent review, not by the build agent) with
  a new migration, `20260731070336_restore_trgm_indexes`, recreating all
  five indexes — confirmed via `psql \di` (all five present again) and a
  fresh `EXPLAIN` on the exact query the failing test exercises (`Bitmap
  Index Scan` on `Decklist_name_trgm_idx`, not a sequential scan). Full
  suite re-run after the fix: **136 passed, 0 failed** (14 files).

  **Follow-up structural fix (2026-08-03, also outside the build agent's
  run)**: recreating the indexes only patched the symptom — they were still
  undeclared in `schema.prisma`, so any future `prisma migrate dev` would
  keep proposing to drop them again, same as before. Closed for real by
  adding `@@index([col(ops: raw("gin_trgm_ops"))], type: Gin, map: "<exact
  existing name>")` to `Card`/`Decklist`/`RuleSection` (migration
  `20260803064956_declare_trgm_indexes`) — Prisma's GIN-with-operator-class
  syntax, confirmed against current docs rather than assumed. Verified via
  `prisma migrate dev --create-only` (the safe, shadow-DB-only preview
  path) run **twice, independently**: both times generated an **empty
  migration**, meaning Prisma's diff engine now recognizes the indexes as
  already correct instead of unexplained drift — the actual hazard (not
  just this one incident) is closed, not merely documented. A `pg_dump`
  backup (`prisma/pg_dump/`, gitignored — see its `README.md`) was taken
  before this as a precaution; turned out to be unneeded since nothing
  destructive was ever proposed.
- **Dev-mode boot + curl**: `next dev` on port 3000, `GET /` → 200. All new
  routes/params exercised with real curl requests and cross-checked against
  direct `psql`/Prisma counts where applicable (pack filter: 113 cards for
  `pack=core_set` matching `SELECT count(*) ... WHERE "packCode"='core_set'`;
  operator syntax: 27 cards for `q=f:anarch+s:virus` matching the direct
  faction+keyword count; checklist/names views: 200; card detail
  also-printed-in + legality lines: verified against real rows; decklist
  author/date/notes/sort: verified against real rows).
- **Production build + start + curl** (separate from dev, per the explicit
  instruction not to skip this): `next build` succeeded (all 13 routes
  compiled, TypeScript pass included in the build). Then `next start` on
  port 3000, and the **same** curl requests re-run against the production
  server: homepage 200; pack filter 200 with matching card count in the
  rendered HTML; operator syntax 200 with matching count; card detail page
  200 with "Also printed in" and "Legal in: ..." both present and correct;
  decklist detail 200 with sort order applied; admin sync route 401
  unauthenticated / 200 + SUCCESS authenticated. Both dev and prod servers
  were stopped after verification — port 3000 confirmed free
  (`netstat -ano | grep :3000` → no output) at the end of the run.
- **Schema changes verified by direct introspection**: `docker exec
  jinteki-postgres-1 psql ... \d "Format"` / `\d "Restriction"` /
  `\dT+ "SyncType"` — all confirmed to match `schema.prisma` exactly,
  including the `Restriction_formatId_fkey` FK and the new
  `RESTRICTIONS` enum value.
- **Data-writing logic verified by real row counts**: `Format` = 6,
  `Restriction` = 56 via direct `SELECT count(*)`, matching the live NRDB
  `meta.stats.total.count` for both resources at spike time (not just the
  sync script's own reported count, though those also matched: 62 = 6+56).
- **Auth-gated routes rejected with real requests**: `POST
  /api/admin/sync/restrictions` unauthenticated → 401 (both dev and prod);
  authenticated via the real `unmeel@gmail.com` admin session's
  `sessionToken` cookie → 200 + SUCCESS run, in both dev and prod.

## Left unresolved / follow-ups

- ~~The pre-existing missing trigram GIN indexes~~ — **not pre-existing;
  this phase's own migration dropped them.** Fixed in two steps (see the
  corrected Tests section above): `20260731070336_restore_trgm_indexes`
  recreated them, then `20260803064956_declare_trgm_indexes` declared them
  properly in `schema.prisma` so the underlying hazard (Prisma's diffing
  not understanding hand-written GIN indexes) is actually closed — confirmed
  via two independent `migrate dev --create-only` dry runs both coming back
  empty — not just patched for this one incident. No outstanding action
  needed here.
- Item 9's optional stretch (a `restriction`/format filter on `/cards`) was
  explicitly not required by the plan and not built — the core ask
  (surface current status on the detail page) is what was built.
- Item 9's "restriction history" (showing superseded snapshots, not just
  the active one) is explicitly deferred per the plan.
- Item 10 remains unbuildable without a deeper per-printing sync — revisit
  only if that ever changes.
