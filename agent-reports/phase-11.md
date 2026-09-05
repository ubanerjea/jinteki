# Phase 11 — Task Report: Format Card Links, Sets, and Decklist Layout

Built against `plans/PHASE_11_PLAN.md`. Chain: build subagent → orchestrator static
review → independent verify subagent. Nothing marked "Explicitly out of scope" was
built (no MWL/points-budget, no visible Banned picker, no `Pack` model/`pack=` param
rename, no decklist "Standard legal" badge, no simple-search `b:` prefix).

This is the **consolidated** report (build + review + verify). Verify independently
re-derived the plan's checks rather than trusting the build's self-reported numbers.

## What was built

### 0. Cycles + Pack columns

- **`prisma/schema.prisma`** — new `Cycle` model (`id`, `name`, `dateRelease`,
  `position`, `raw`); `Pack` gains `dateRelease`, `size`, `cardCycleId` (nullable FK
  → `Cycle`), `cardSetTypeId`, `position`, `raw`. Prisma model name stays `Pack`.
- **`prisma/migrations/20260905002012_add_cycles_and_pack_columns/`** — add-only
  (`CREATE TABLE`, `ADD COLUMN`, `ADD CONSTRAINT`). No drops.
- **`src/sync/sync-factions-packs.ts`** — fetches `/card_cycles` first, upserts
  cycles, then packs with the new columns. No new `SyncType`. Admin label is
  "Factions + Sets + Cycles"; URL key still `factions-packs`. Cycles with no
  remaining packs are cleaned up; packs are not `deleteMany`'d (would hit
  `Card.packCode` — see Deviations).
- **`src/lib/nrdb/types.ts`** — `CycleAttributes` / `CycleResource`;
  `CardSetAttributes.position`.
- Fixtures + **`src/sync/sync-factions-packs.test.ts`** — Borealis, a single-set
  cycle, a null-date set.

### 1–2. Format-page links, restriction collapse, `banned` predicate

- **`src/lib/search/cards.ts`** — `buildFacetConditions` is async.
  `format=` is current-pool membership (`Format.activeCardPoolId` against
  `card_pool_ids`), not historical `format_ids`. Unknown format / null
  `activeCardPoolId` matches nothing. `pack=` is `card_set_ids` containment
  (any printing); several values are OR-within-facet.
- **`src/lib/search/cards-advanced.ts`** — `banned=1|0` (same Ignore/Yes/No
  parsing as decklist `tournamentLegal`). Applied only with `format`.
  `banned=0` with a null `activeRestrictionId` is a no-op; `banned=1` in that
  case matches nothing.
- **`src/lib/restrictions.ts`** — `partitionRestrictionHistory` splits
  active+scheduled vs past (classifier itself unchanged).
- **`src/app/formats/[id]/page.tsx`** — "View cards currently legal in this
  format" (`format=<id>&banned=0&pageSize=30`; omits `banned=0` when there is
  no active restriction). Past restrictions in `<details>`. Banned heading
  links to `banned=1` when the banned group is nonempty.
- **`src/app/cards/advanced/page.tsx`** — hidden `banned` input restored from
  searchParams; no visible row. Pack row renamed Set, options sorted
  `dateRelease` desc nulls last.
- **`src/app/cards/advanced/results/page.tsx`** — summary `Banned Yes` / `Banned No`.
- **`src/app/cards/syntax/page.tsx`** — `banned=1`/`banned=0` documented as
  advanced-results query params (requires `format=`; no `b:` prefix).
- **`src/lib/search/filter-summary.ts`** — facet label Pack → Set.

### 3–6. Current-pool set table, `/sets`

- **`src/lib/sets.ts`** — `groupSetsByCycle`: multi-set cycle → header + nested
  packs; single-set cycle → pack row only; header size = sum of child sizes;
  header date = latest child date. `packSearchHref` for set/cycle links.
- Format page card-pool section: active name always visible; set table +
  nested "Rotation history" inside `<details>` ("Sets in this pool").
- **`src/app/sets/page.tsx`** — NRDB-style table (Name / Cards / Release Date /
  Standard / Startup / Eternal). Checkmarks from cards that have the format's
  `activeCardPoolId` in `card_pool_ids` and the pack in `card_set_ids` — not
  from `CardPool.cardCycleIds` alone.
- **`src/components/site-header.tsx`** — Sets after Formats.

### 7–9. List metadata and decklist layout

- **`src/components/card-results.tsx`** — list view only: set name (`Pack.name`
  via `packCode`) in its own span, not inside `{faction} - {type} - {side}`.
  One `pack.findMany`, no N+1.
- **`src/lib/decklist-view.ts`** — influence used/limit, agenda points (corp
  only), grouping with quantity-sum headings, `●` pips.
- **`src/lib/decklist-card-order.ts`** — `compareBySet` (original-printing
  `packCode`, groups by `Pack.dateRelease` desc).
- **`src/app/decklists/[id]/page.tsx`** — metadata + set + pips on each row;
  Sort: Type | Faction | Set | Name; section headings except on name sort.
- **`src/app/decklists/advanced/page.tsx`** — Pack → Set, same date sort.

## Deviations from the plan

1. **Pack `deleteMany` not added.** Pre-existing factions-packs sync never
   deleted packs; this job still runs before cards, so deleting packs would
   violate `Card.packCode`. Cycles with no remaining packs *are* cleaned up.
2. **Unknown format / null `activeCardPoolId` matches nothing** (`false`), not
   a no-op. Honest: there is no current pool to be a member of. ram /
   system_gateway / core all have a non-null `activeCardPoolId` today.
   `format=core` returns 0 because no synced card lists pool id `core` in
   `card_pool_ids` (independently confirmed).
3. **`banned=1` with a null `activeRestrictionId`** matches nothing;
   **`banned=0`** is a no-op, as the plan specified for the legal-cards link.
4. Decklist `format=` is still historical `format_ids` (Phase 10). Only
   card-search `format=` changed, per this plan's scope.

## Static review (orchestrator)

Read schema/migration, `buildFacetConditions`, banned SQL, `groupSetsByCycle`,
`decklist-view.ts`, format/sets/decklist pages, and card list markup against
the plan. No correctness issues found. Migration is add-only. Pack facet is
OR-within-facet, so multi-`pack=` cycle links are valid. Hidden banned input
and Edit-search round-trip are present. GIN-index hazard not triggered.

## Verification

Independent verify pass, 2026-09-04. Production `pnpm build` + `pnpm start` +
curl; HTML counted after stripping `self.__next_f.push` scripts. Counts
re-derived via `psql` from semantics, not by copying the implementation SQL.

### Static

| Command | Result |
|---|---|
| `pnpm exec tsc --noEmit` | pass |
| `pnpm lint` | pass |
| `pnpm test` | **351 passed**, 0 failed, 25 files |
| `$queryRawUnsafe` / `$executeRawUnsafe` | comments only, zero actual usage |

### Schema / sync (psql + live API)

| Check | Result |
|---|---|
| Live `/card_cycles` total | **29** |
| `SELECT count(*) FROM "Cycle"` | **29** |
| Live `/card_sets` total | **75** |
| `SELECT count(*) FROM "Pack"` | **75** |
| Borealis packs | booster 7 / 2022-03-18; Midnight Sun 65 / 2022-07-22; Parhelion 63 / 2022-12-09; header 135 / 2022-12-09 |
| Pack `dateRelease` / `cardCycleId` nulls | **0** / **0** |
| GIN indexes | all 5 still present |
| `pnpm sync:factions` (build pass) | SUCCESS — 116 records (12 factions + 29 cycles + 75 packs) |

### Search counts (psql = production curl)

`Format.standard.activeCardPoolId = standard_2026_vantage_point`  
`Format.standard.activeRestrictionId = standard_ban_list_26_03`

| Predicate | psql | Rendered |
|---|---|---|
| current Standard pool | **613** | **613** |
| pool AND banned | **29** | **29** |
| pool AND NOT banned | **584** | **584** |
| `card_set_ids` contains `system_gateway` | **77** | **77** |
| `packCode = 'system_gateway'` (control, unused) | 75 | — |
| Card.raw banned vs Restriction.verdicts.banned | 29 = 29, 0 only-in-one | — |

Old `format_ids` containment for standard is still 2016; that is no longer
what `format=` does.

### Production curl (feature pages)

- **`/formats/standard`** — 200. Legal-cards href has `format=standard&banned=0`.
  Banned heading links `banned=1` (`Banned (29)`). Visible restriction list:
  1 active (`26.03`), 2 scheduled (`26.08`, `26.05`). Past only inside
  `<details>` (`32 earlier lists`). 0 "ignore active date". Active card pool
  visible without opening details. "Sets in this pool" contains Vantage Point,
  Elevation, and Borealis (135 · 2022-12-09) with nested Parhelion / Midnight
  Sun. Nested "Rotation history" with Seventh Rotation.
- **`/formats/ram`** — 200. Legal-cards href has no `banned=`. No banned link.
  Empty-history sentence unchanged. No restriction `<details>`. Set expander
  omitted (`cardCycleIds` empty) — matches the plan.
- **`/sets`** — 200. Header: Cards / Decklists / Rules / Formats / **Sets**.
  Columns as specified. Vantage Point `66` / `2026-03-02` / ✓ ✓ ✓. Borealis
  header 135 / 2022-12-09 with nested Parhelion and Midnight Sun. Set names
  link to `/cards/advanced/results?pack=...`.
- **`/cards/advanced`** — label Set, not Pack. No visible Banned row. Hidden
  `banned` input restored when the param is present.
- **`/cards/syntax`** — documents `banned=1`/`banned=0` as advanced-results
  params; "there is no `b:`".
- **List view** — Abaasy: `<span>Parhelion</span>` separate from
  `<span>Anarch - Program - Runner</span>`.
- **Corp decklist** — `Agenda (14)` etc. (quantity-sum, not row-count);
  `Influence: … 15/15`; `Agenda points: 20`. `?order=name` has no section
  headings. `?order=set` is the active sort with set groups.
- **Runner decklist** — Influence present; no Agenda points.
- **Edit search** from `banned=1` results still carries `banned=1`.
- **`format=core`** — 0 cards found, matching psql (no card lists pool id
  `core`). Honest, not a filter bug.

Out of scope still absent: no visible Banned picker, no "Standard legal" on
decklists, Prisma model still `Pack`, URL param still `pack=`.

## Unresolved / nits (not blockers)

- Interactive `<details>` open/close cannot be proven by curl; only that the
  tags exist and the past/set/rotation rows are nested inside them.
- `pageSize=1` / `pageSize=5` clamp to the 30/60/100 allowlist (pre-existing
  pagination). Totals in "N cards found" are still the real totals.
- `format=core` is an empty pool under the new current-pool meaning of
  `format=`. Fine unless someone expects `format_ids` membership (2016-style)
  for Core.

**Fix-up round: not required.** Phase 11 is complete.
