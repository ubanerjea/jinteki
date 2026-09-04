# jinteki — Phase 10 Build Plan: Format Restriction History, Rotation & Tournament-Legal Filters

## Context

This phase closes out `plans/FORMATS_SECTION_FIXES_PLAN.md` (the open-ended "formats section
fixes" running list) by taking its three drafted fixes — display correctness for restriction
history, syncing NRDB's card-pool ("rotation") data, and decklist rotation/tournament-legal
filters built from that data — and turning them into one closed, phase-numbered batch of work,
per `PROJECT_PLAN.md`'s "Phases" convention. That source doc's own research
(`agent-reports/nrdb-rotation-and-tournament-legal-research.md`,
`agent-reports/format-descriptions-links-and-search-plan.md`/`-build.md`) is the baseline this
plan builds on; read those first. Once this phase ships, `FORMATS_SECTION_FIXES_PLAN.md` moves to
`plans/archive/` — its three fixes become this plan's sections 1–3, and it stops being the
open-ended home for format-section work (a future fix would get either its own small plan or a
new phase, not a revived version of the archived doc).

Nothing here touches `PROJECT_PLAN.md`'s scope, the `User`/auth system, or Phase 9's remote-access
work — this is pure data-model and read-path work on `Format`/`Restriction`/`Decklist`.

## Baseline read directly against the repo before writing this plan

Confirmed live in this session (2026-09-04), not carried over from the source doc unverified:

- `prisma/schema.prisma` has `Format.activeRestrictionId` (line ~305) but **no** `CardPool` model
  and **no** `activeCardPoolId` column anywhere — Fix 2/3's schema work has not been started.
- `grep -rn "rotation" src/` (all of `src/`, `.ts`/`.tsx`) returns **zero** matches — no rotation
  logic, filter, or UI exists anywhere in the app today.
- `src/app/formats/[id]/page.tsx` has no reference to "(ignore active date)", "classic", or any
  scheduled/future-vs-past distinction — the restriction-history list still renders every
  `Restriction` row matching `formatId` with only a single `isActive` check
  (`restriction.id === format.activeRestrictionId`), exactly the state Fix 1 describes fixing.
- i.e. **none of the three fixes in `FORMATS_SECTION_FIXES_PLAN.md` have been built** — the plan
  document and its research exist, the code does not. This phase is a straight build of all three,
  not a partial continuation.

Re-verify the following live numbers at build time rather than trusting them as frozen (per this
project's standing discipline — see `PHASE_8_PLAN.md`'s baseline for the same caveat applied to
`Decklist` counts):

- `SELECT id FROM "Restriction" WHERE name LIKE '%(ignore active date)%'` — 6 rows as of the
  original research pass; confirm the current exact set.
- `Format.standard.activeRestrictionId` — `standard_ban_list_26_03` as of the original research;
  confirm current value (NSG may have flipped the active flag since).
- `eternal`'s `activeRestrictionId` and restriction count (`eternal_points_list_26_03`, 8 total)
  as of `agent-reports/format-descriptions-links-and-search-build.md`'s cross-check.

## Scope

1. **Restriction-history display fix** — classify each format's restriction history as
   active/scheduled/past, and exclude NRDB's "(ignore active date)" legacy entries. Pure
   query/render logic, no schema change.
2. **`CardPool` sync** — new model + sync step for NRDB's `card_pools` resource, plus promoting
   `Format.activeCardPoolId` to a real column, plus `rotations.json` for authoritative "Nth
   Rotation" labels. Rendered on `/formats/[id]`.
3. **Decklist rotation & tournament-legal filters** — new `/decklists/advanced` filters computed
   entirely from jinteki's own synced data (section 2's `CardPool` + already-synced `Restriction`
   verdicts), since neither filter is exposed by NRDB's public API. Depends on section 2.

Build order follows the dependency: section 1 has no dependency on the others and can be built
first or in parallel; section 3 cannot start until section 2's `CardPool` data exists.

---

## 1. Restriction-history display fix

### Problem

`/formats/[id]`'s restriction-history list conflates four different things with no visual
distinction: real past history, the currently-active entry, real future/staged entries NSG has
scheduled but not yet flipped active, and unrelated "NRDB Classic" legacy bookkeeping entries that
shouldn't appear in a Standard-history view at all.

### Root cause (confirmed against primary sources, not guessed)

`active_restriction_id` is a hand-set editorial flag in NSG's source data
(`github.com/Null-Signal-Games/netrunner-cards-json`) — each format is a chronological array of
snapshots, exactly one flagged `active: true` by NSG maintainers, **not** automatically the
most-recent-by-date entry. jinteki's own `Format.activeRestrictionId`
(`src/sync/sync-restrictions.ts`'s `mapFormat()`) already mirrors this flag correctly — there is no
sync bug. Separately, six `Restriction` rows carry `format_id: "standard"` but a name ending in
`"(ignore active date)"` and an id pattern like `..._for_classic_only` — this is NRDB's own
documented signal (found verbatim in `Null-Signal-Games/nrdbv2`'s frontend source, and explicitly
excluded from NRDB's own format-snapshot validation test) that these are legacy bookkeeping for
the old classic site, never wired into any format's live timeline. The actual bug is purely
**display**: jinteki renders both the scheduled-but-not-active entries and the legacy entries as
if they were ordinary history.

### Fix

All changes are query/render logic only — no schema change (`Restriction` already has everything
needed: `id`, `name`, `formatId`, `dateStart`, `raw`).

- **`src/lib/restrictions.ts`** — add a new pure, unit-tested function alongside
  `computeCardLegality`/`summarizeLegality`:

  ```ts
  export type RestrictionHistoryStatus = "active" | "scheduled" | "past";

  export interface RestrictionLike {
    id: string;
    name: string;
    dateStart: Date | null;
  }

  export interface RestrictionHistoryEntry {
    restriction: RestrictionLike;
    status: RestrictionHistoryStatus;
  }

  export function classifyRestrictionHistory(
    format: FormatLike,
    restrictions: RestrictionLike[],
  ): RestrictionHistoryEntry[]
  ```

  - **Excludes legacy entries**: filter out any restriction whose `name` ends with
    `"(ignore active date)"` before classifying anything else — NRDB's own semantic marker, not a
    jinteki-invented heuristic. (Fallback if this ever proves too fragile: an explicit id denylist
    of the known `..._for_classic_only` ids — prefer the name-suffix match since it needs no
    jinteki-side maintenance as NRDB adds new legacy entries upstream.)
  - **Classifies by comparing each restriction's `dateStart` against the *active* restriction's
    `dateStart`** (found by matching `restriction.id === format.activeRestrictionId`), **not**
    against wall-clock "today" — a scheduled entry's `date_start` can already be in the past
    relative to real time while still not being the flipped-active entry. Later than the active
    entry's `dateStart` → `"scheduled"`; matches `format.activeRestrictionId` → `"active"`;
    everything else → `"past"`.
  - Preserves the existing newest-first (`dateStart` descending) ordering.
  - A format with `activeRestrictionId: null` (e.g. `ram`/`system_gateway`): with no active entry
    to compare against, nothing can be "scheduled" relative to it — treat everything as `"past"`
    (confirm this doesn't matter in practice today, since those two formats have zero `Restriction`
    rows regardless).

- **`src/app/formats/[id]/page.tsx`** — replace the existing inline
  `restriction.id === format.activeRestrictionId` check with
  `classifyRestrictionHistory(format, restrictions)`. Render:
  - `"active"` → unchanged existing bold + "active" badge.
  - `"scheduled"` → a distinct badge (e.g. "scheduled") so a future/staged snapshot reads clearly
    as "not yet in effect," not as superseded history.
  - `"past"` → unchanged plain rendering.
  - Legacy entries are simply absent (already filtered by `classifyRestrictionHistory`) — no
    "N legacy entries hidden" note for v1; add one later only if a real user asks, per this
    project's preference against building for hypothetical needs.

### Testing

`src/lib/restrictions.test.ts` (or a new co-located file if that one is judged too crowded —
build-time judgment call): pure-function unit tests, no DB needed —

- A restriction named `"... (ignore active date)"` is excluded entirely, regardless of `dateStart`.
- A restriction later-dated than the active one is `"scheduled"`, not `"past"`.
- The restriction matching `format.activeRestrictionId` is `"active"`.
- A restriction earlier-dated than the active one is `"past"`.
- Ordering (newest-first) is preserved across all three statuses mixed together.
- `activeRestrictionId: null` → everything classifies `"past"`.

### Verification

- Real `curl` + direct `psql` cross-check against `/formats/standard`: the current
  `"(ignore active date)"` rows (re-query the exact current set, don't assume the original 6) must
  not appear anywhere in the rendered history; any restriction later-dated than the current active
  one must render "scheduled"; the current active restriction must still render "active"; older
  entries render plain, unchanged.
- Repeat against `eternal` (or whichever format currently has an active pointer partway through
  real history — re-confirm live) to prove the fix isn't Standard-specific hardcoding.
- `ram`/`system_gateway` still render "No ban/points list has ever applied to this format"
  unchanged.
- Standard project verification standards: typecheck/lint clean, `pnpm test` green including the
  new `classifyRestrictionHistory` cases, dev-mode `curl` + a separate production
  `build`+`start`+`curl` re-check. No migration in this section, so no `psql \d` step needed here.

---

## 2. Sync and expose card-pool ("rotation") data

### Problem

`/formats`/`/formats/[id]` has no way to show Standard's rotating card-pool history or label which
pool is currently active. `Format.raw.attributes.active_card_pool_id` is already synced into JSONB
(part of the raw NRDB resource) but unused by any column or view.

### Fix

- Promote `Format.raw.attributes.active_card_pool_id` to a real column (`activeCardPoolId`), same
  pattern as the existing `activeRestrictionId`. No new sync required for this part alone.
- Add a new `CardPool` model + sync step (new `SyncType` variant) from NRDB's `GET /card_pools`,
  analogous to `sync-restrictions.ts`. Name it `CardPool`, not anything confusable with the
  existing `Pack` model (`Pack` already maps to NRDB's distinct `card_sets` resource; `card_pools`
  is a different resource). Needs `id`, `name`, `formatId`, `cardCycleIds`, `raw`.
- Also sync `rotations.json` from `netrunner-cards-json` (a repo file, not an API resource —
  separate fetch) for authoritative "Nth Rotation" ordinal/name labels. Do **not** derive the
  ordinal by string-matching `card_pools.attributes.name` against `.*Rotation$` —
  `rotation_2020`/"Salvaged Memories" breaks a naive sequential match.
- Render on `/formats/[id]`: the active card pool (labelled with its rotation ordinal where one
  applies) and a rotation-history list, in the same style as the existing restriction-history list
  (including section 1's active/scheduled/past distinction, if NRDB's card-pool snapshots turn out
  to have the same staged-vs-active shape restrictions do — confirm at build time rather than
  assuming the two resources behave identically).

### Testing

Sync-mapping unit tests mirroring `sync-restrictions.ts`'s existing test shape (mapping a raw
`card_pools` fixture resource → `CardPool` row fields, including the `rotations.json` ordinal
lookup with at least one non-sequential-name case like `rotation_2020` covered explicitly).

### Verification

- `psql` row count for the new `CardPool` table matches the live `card_pools` count per format from
  `api.netrunnerdb.com/api/v3/public/card_pools?filter[format_id]=...`.
- `/formats/standard` renders the correct active rotation label, cross-checked against the live
  API's `active_card_pool_id`/`card_pools` data.
- Standard project verification standards, including `psql \d` schema introspection (this section
  adds a migration) and the standing GIN-index-survival check (`Format`/`Restriction`'s existing
  indexes untouched, confirmed via `\di`/`pg_indexes`, not assumed from Prisma's migration-success
  message).

---

## 3. Decklist rotation and tournament-legal filters

### Problem

NRDB's own decklist search offers "Rotation" and "Tournament Legal" filters; jinteki's
`/decklists/advanced` (built in Phase 8) has neither.

### Background

Neither filter is exposed by NRDB's public v3 API (`filter[rotation_id]`, `filter[is_legal]`,
`filter[mwl_code]` all return HTTP 500 and are undocumented) — both only exist behind NRDB's
classic site's non-public search endpoint. There is no NRDB value to sync for either; both are
entirely jinteki's own computed features, depending on section 2's `CardPool` data. Full
primary-source detail: `agent-reports/nrdb-rotation-and-tournament-legal-research.md`.

### Fix

- **Rotation filter**: using section 2's `CardPool.cardCycleIds`, compute whether a decklist's
  cards (`Decklist.raw.attributes.card_slots`) all belong to a target pool's cycles; expose as a
  `/decklists/advanced` search param mirroring NRDB's `rotation_id`. Follows the same per-card
  `EXISTS`/`NOT EXISTS`-over-`DecklistCard` shape Phase 8 already used three times (pack,
  cards-used, cards-excluded, and its own Format-pool-membership addendum) — genuinely the same
  pattern again, not new infrastructure.
- **Tournament-legal filter**: compute per-decklist, per-format legality by combining (a) ban-list
  verdicts already synced (`Restriction.raw.attributes.verdicts`, already read by
  `src/lib/restrictions.ts`/`src/lib/search/format-cards.ts`) and (b) card-pool membership from
  section 2. Expose as a boolean `/decklists/advanced` filter mirroring NRDB's `is_legal`.
- Keep `follows_basic_deckbuilding_rules` (already synced, already a distinct concept — structural
  deckbuilding validity) separate from "tournament legal"; don't conflate them.
- This is explicitly **not** the same as Phase 8's "Explicitly deferred" deck-wide MWL/points-budget
  legality aggregation (`universal_faction_cost`/`global_penalty`/points-under-budget computation)
  — that remains out of scope here too, left for its own dedicated future session per Phase 8's
  plan. This section's "tournament-legal" is the narrower ban-list-verdict + pool-membership
  question only.

### Testing

`decklists-advanced.test.ts` gains: unit tests for the rotation/legality computation functions
against fixture decklists and card pools (no DB needed for the pure logic), plus real-DB tests
mirroring Phase 8's existing shape for the other facets — a rotation-filter query cross-checked
against a direct `psql`/manual count, and a tournament-legal query cross-checked the same way.

### Verification

- Unit tests for the rotation/legality computation functions against fixture data.
- Spot-check a handful of real decklists' computed results against NRDB's own classic-site search
  (`netrunnerdb.com/en/decklists/find?rotation_id=...`/`is_legal=...`) for agreement.
- Standard project verification standards (`plans/PROJECT_PLAN.md`), including a fresh-at-build-time
  `psql` cross-check (don't reuse any number written in this plan) for whatever filter combination
  is checked live.

---

## Explicitly out of scope for this phase

- **True deck-wide MWL/points-budget legality** (points-under-`Restriction.point_limit`,
  `universal_faction_cost`/influence, `global_penalty`) — carried over unchanged from Phase 8's own
  deferral; still a materially bigger, genuinely new computation, left for a dedicated future
  session with its own design pass.
- **A "N legacy entries hidden" affordance** for section 1's filtered-out "(ignore active date)"
  rows — add only if a real user asks.
- Anything deployment/hosting-related — unchanged, out of scope per `PROJECT_PLAN.md`.

## Testing (repo-wide)

Same `pnpm test` / Vitest conventions as every prior phase — no mocking, real Postgres via
`docker compose up -d` for anything DB-backed, pure-function unit tests for anything that doesn't
need the DB (section 1's classifier, section 3's rotation/legality pure logic).

## Verification

Full `PROJECT_PLAN.md` "Phase verification standards" for the phase as a whole: typecheck/lint,
`pnpm test`, dev boot+curl, a **separate** production `build`+`start`+curl, tests passing, and —
since sections 1–3 collectively touch schema (section 2), sync logic (section 2), and search logic
(section 3) — direct `psql` introspection after the migration (GIN indexes on `Format`/`Restriction`
/`Decklist` still present) and real row-count/spot-check verification of the `CardPool` sync,
per the standing "don't trust self-reported counts" discipline. No `$queryRawUnsafe` or
string-concatenated SQL anywhere in new files (grep, per every prior phase's hard requirement).

Once this phase's verification passes, `agent-reports/phase-10.md` is the task report per
`AGENTS.md`'s convention, and `plans/FORMATS_SECTION_FIXES_PLAN.md` (superseded by this plan) moves
to `plans/archive/FORMATS_SECTION_FIXES_PLAN.md`.
