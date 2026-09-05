# jinteki — Phase 11 Build Plan: Format Card Links, Sets, and Decklist Layout

## Context

Phase 10 made `/formats/[id]`'s restriction history truthful and added card-pool / rotation data,
plus decklist rotation and tournament-legal filters. Using the format pages and decklists after
that work turned up a second, UI-shaped gap: a format page still cannot send the user into card
search, past restrictions bury the active/scheduled ones, the current card pool is a name without
its sets, there is no sets index, card/decklist lists omit set and influence, and a decklist is a
flat `<ul>` rather than the sectioned list Netrunner players expect.

This phase is that follow-up. It does not reopen Phase 10's data model (no MWL/points-budget
legality, no change to `classifyRestrictionHistory` or `CardPool` sync). It does add the missing
`card_cycles` resource and the `card_sets` fields Phase 2 discarded, because items 3–6 and 8
cannot be built from `Pack.code` + `Pack.name` alone.

Nothing here touches auth, remote access, or `PROJECT_PLAN.md`'s deployment scope.

## Baseline read directly against the repo and live data before writing this plan

Confirmed live 2026-09-04, not carried over from Phase 10 unverified:

- `Pack` is still `{ code, name }` only. `src/sync/sync-factions-packs.ts`'s `mapPack()` drops
  `date_release`, `size`, `card_cycle_id`, `card_set_type_id`, `position` even though
  `CardSetAttributes` already types them. `SELECT count(*) FROM "Pack"` → **75**, matching live
  `GET /card_sets` `meta.stats.total.count`.
- Cycles are not stored. Live `GET /card_cycles` → **29** rows. A cycle carries `name`,
  `date_release`, `card_set_ids`, `position`. Example: `borealis` has
  `["midnight_sun_booster_pack", "midnight_sun", "parhelion"]`.
- `Card.packCode` is the **last** `card_set_ids` entry, i.e. original printing, not latest
  (`sync-cards.ts`). Live: `packCode = 'system_gateway'` → **75** cards; `card_set_ids` contains
  `system_gateway` → **77** (Hedge Fund and similar reprints). `vantage_point` is 66/66 either way
  (no reprints yet).
- Card-search `format=` is `format_ids` JSONB containment (`buildFacetConditions` in
  `src/lib/search/cards.ts`). Live: `format=standard` → **2016** cards. The current Standard pool
  (`card_pool_ids` contains `standard_2026_vantage_point`) is **613**. The Format row hint already
  says "Cards in that format's card pool", which is the 613, not the 2016.
- Standard's active restriction `standard_ban_list_26_03` has **29** banned codes; all 29 are in
  the current pool. Pool-and-not-banned → **584**.
- `/cards/advanced`'s Pack row is **already** a `FacetPicker` (multi-select). It is **not** a
  single `<select>`. Options are `prisma.pack.findMany({ orderBy: { name: "asc" } })`.
- `/decklists/[id]` sorts type/faction/name via `src/lib/decklist-card-order.ts`, renders
  `title` + `x{qty}` only, no section headers, no influence, no set. Default sort is type.
- No `<details>`/`<summary>` anywhere under `src/`. Site header has Cards / Decklists / Rules /
  Formats — no Sets.
- Influence lives on the card resource as `influence_cost` (not `faction_cost`); identities have
  `influence_limit` (e.g. NBN: Reality Plus → 15) and `minimum_deck_size`. Agenda points are
  `agenda_points`. All already in `Card.raw`; none are columns.
- NRDB's `/en/sets` (fetched 2026-09-04) is a table of **set rows plus cycle header rows** for
  multi-set cycles only (Borealis, Liberation, Ashes, …), columns Name / Cards / Release Date /
  Standard / Startup / Eternal. Single-set cycles (Vantage Point, Elevation, Core Set) are a set
  row with no extra cycle row. Cycle header card-count is the sum of child set `size`s (Borealis
  63+65+7=135). Cycle header date is the **latest child set** date (Borealis 2022-12-09 =
  Parhelion), not `card_cycles.date_release` (2022-07-22 = Midnight Sun).

Re-verify the pinned counts above at build time rather than treating them as frozen.

## Decisions (read these before the sections)

1. **Prisma model stays `Pack`; user-facing word is "Set".** Renaming the table/model is out of
   scope (FK churn across Card, DecklistCard, every pack filter). The URL param stays `pack=` so
   existing advanced-search links keep working. Labels, hints, syntax docs, and `/sets` say Set.
2. **Card-search `format=` becomes current-pool membership**, not `format_ids`. Implementation:
   look up `Format.activeCardPoolId` for the selected format id, then
   `(raw->'attributes'->'card_pool_ids') @> to_jsonb(activeCardPoolId)` — the same JSONB
   containment Phase 10 already uses on decklists. This matches the Format row's existing hint
   and is what "cards legal in this format currently" needs. It **changes** `/cards` and
   `/cards/advanced` `format=standard` from 2016 rows to 613. That is deliberate, not an accident;
   tests that pin the old 2016 must be updated from a fresh `psql` count, not from this paragraph.
   `format_ids` stays on the card (legality display on `/cards/[code]` still uses it).
3. **"Currently legal" on a format page is `format=<id>&banned=0`.** Once `banned` exists, the
   one-click link is pool membership minus currently-banned, not the URL the request sketched
   (`format=standard` alone). Restricted/points cards stay in; they are still legal. Formats with
   a null `activeRestrictionId` (`ram`, `system_gateway`, `core`): `banned=0` is a no-op and the
   link is just `format=<id>`.
4. **Set filter matches any printing**, via `card_set_ids`, not `Card.packCode`. Clicking System
   Gateway must include Hedge Fund. Same `pack=` param, different predicate. `packCode` remains
   the original-printing FK and is what the card-search **list view** uses to label a card's set
   (one name per row, existing column, no extra JSONB).
5. **Collapse with `<details>`/`<summary>`, no new client component.** Same no-JS default as the
   rest of the app; FacetPicker stays the only client exception.
6. **No visible Banned row on `/cards/advanced`.** Hidden `<input type="hidden" name="banned">`
   restored from `searchParams` so Edit search keeps it. Typed in by hand on the results URL, or
   planted by the format-page links.

## Scope

Build order follows the data dependency: section 0 (schema/sync) before 3/4/5/6/8; section 2
(search predicates) before the format-page links in 1/2b/4. Sections 7 and 9 can start once 0's
Pack names/dates exist but do not need section 2.

---

## 0. Sync cycles; promote the rest of `card_sets`

### Problem

`Pack` cannot sort by release date, group into Borealis-style cycles, or show a card count.
Cycles are not synced at all. Phase 10's `CardPool.cardCycleIds` has nothing to join to.

### Fix

- New `Cycle` model, NRDB `card_cycles` id as PK: `id`, `name`, `dateRelease DateTime?`,
  `position Int?`, `raw Json`. Relation `packs Pack[]`.
- `Pack` gains `dateRelease DateTime?`, `size Int?`, `cardCycleId String?` (FK → `Cycle`,
  nullable so a first-ever packs-before-cycles ordering cannot fail a NOT NULL),
  `cardSetTypeId String?`, `position Int?` (position inside the cycle), `raw Json?`.
- Extend `src/sync/sync-factions-packs.ts` (do **not** add a new `SyncType`): fetch `/card_cycles`
  first, upsert cycles, then packs with the new columns. Same full-resync + `deleteMany` cleanup
  the file already uses for factions/packs. Admin label can become "Factions + Sets + Cycles";
  the URL key stays `factions-packs`.
- Types: `CycleAttributes` / `CycleResource` in `src/lib/nrdb/types.ts`. `mapPack` / `mapCycle`
  unit tests against real fixtures (include `borealis` and a single-set cycle like
  `vantage_point` / `elevation`).
- Migration is add-only: `CREATE TABLE`, `ADD COLUMN`, `ADD CONSTRAINT`. Inspect generated SQL
  for GIN-index drops before applying.

### Testing / verification

- `SELECT count(*) FROM "Cycle"` equals live `/card_cycles` total (29 as of this writing).
- `Pack` row count still 75; `dateRelease` / `cardCycleId` populated for every pack that the
  live API gives a value (spot-check Borealis's three sets against the live resource).
- `\di` GIN indexes untouched.

---

## 1. Format page: one-click currently-legal cards

On `/formats/[id]`, near the title, a link:

`/cards/advanced/results?format=<id>&banned=0&pageSize=30`

Label it plainly, e.g. "View cards currently legal in this format". Formats with no active
restriction omit `banned=0` (it would no-op anyway). The results page's existing Edit search is
how the user refines.

Depends on section 2's `format=` / `banned` predicates. Until those exist, do not ship a link
that hits the old 2016-row `format_ids` filter and calls it "currently legal".

---

## 2. Restriction history collapse, and a Banned card-search predicate

### 2a. Collapse past restrictions

`/formats/[id]`'s restriction list already comes from `classifyRestrictionHistory`. Change the
render, not the classifier:

- `"active"` and `"scheduled"` always visible, same badges as Phase 10.
- `"past"` rows go inside `<details>`. Summary text like "N earlier lists". No expander when
  `past` is empty (`ram` / `system_gateway` / `core` stay on the existing empty sentence).
- No "N legacy entries hidden" note (still out of scope, same as Phase 10).

### 2b. `banned` search param + format-page link

- `AdvancedCardSearchParams` gains `banned?: string` (`"1"` | `"0"`, same Ignore/Yes/No parsing
  as decklist `tournamentLegal`). Anything else → `undefined` (Ignore).
- Only applied when `format` is also set (needs a format to pick `activeRestrictionId`). Silent
  no-op without `format`, same as Phase 10's tournament-legal filter.
- SQL, parameterized `Prisma.sql` only:
  - Look up the format's `activeRestrictionId`.
  - `banned=1` → card's `raw.attributes.restrictions.banned` contains that id.
  - `banned=0` → it does not (or `activeRestrictionId` is null → no extra condition).
- Combined with the new `format=` (current pool). For Standard today that is 29 / 584.
- `/cards/advanced` form: hidden input only, restored from `searchParams` so Edit search keeps
  it. No visible row.
- Results summary includes `Banned Yes` / `Banned No` when the param is set.
- `/cards/syntax`: a short section documenting this as an **advanced-results query param**
  (`banned=1` / `banned=0`, requires `format=`), not a simple-search `f:`-style prefix. Worked
  example counts re-derived at build time. Add it to "Not a simple-search prefix" rather than
  inventing `b:`.
- Format page "Currently banned" heading (or a line next to it) links to
  `/cards/advanced/results?format=<id>&banned=1&pageSize=30`. Omit the link when the banned
  group is empty. Keep the existing per-card links underneath.

The search result set for `format=standard&banned=1` must equal `getFormatCardStatus`'s banned
codes (same 29). If Card.raw's `restrictions.banned` and `Restriction.verdicts.banned` ever
disagree, stop and reconcile — do not ship a link that opens a different list than the format
page shows. (Live they agree: 29 = 29, all in-pool.)

Restricted / points groups do **not** get a search predicate this phase.

---

## 3. Card pool: collapse, then expand to the current pool's sets

Default on `/formats/[id]`: the existing "Active card pool: …" line only.

Inside `<details>` (summary e.g. "Sets in this pool"):

- Every `Pack` whose `cardCycleId` is in the format's **active** `CardPool.cardCycleIds`.
- Grouped the way NRDB's sets table is grouped (confirmed against `/en/sets` 2026-09-04):
  - Sort groups by latest child-set `dateRelease`, newest first.
  - A cycle with **more than one** pack: a cycle header row (name, sum of `size`, latest child
    date) then the packs, newest first, visually nested (indent / nested `<ul>`, not a fake
    table library).
  - A cycle with **exactly one** pack: the pack row only, no duplicate cycle header (Vantage
    Point, Elevation, System Gateway).
- Columns: Name, Cards (`Pack.size`), Release date. No Standard/Startup/Eternal checkmarks
  here — this table is already scoped to one format's current pool. Checkmarks belong on
  `/sets` (section 6).
- Phase 10's numbered-rotation list stays, **below** this set table, still inside the same
  `<details>` (or a nested one headed "Rotation history", which also closes Phase 10's missing
  heading nit). Do not delete it; it is no longer the thing the section expands to show.

Formats with no numbered rotations and a single un-cycled pool (e.g. `core`) still get the set
table if they have packs in `cardCycleIds`; otherwise the expander is omitted.

---

## 4. Set (and cycle) names are card-search links

Every pack name in section 3's table and in section 6's `/sets` table links to

`/cards/advanced/results?pack=<code>&pageSize=30`

using the section-2/5 `pack=` predicate (`card_set_ids` containment).

Cycle header rows (multi-set cycles only) link to the same results URL with **one `pack=` per
child set** (FacetPicker / `allParams` already AND-or-OR? **OR within the pack facet** — same
"any of these packs" semantics the advanced form's hint already states: "Pick one or more.
Several means any of them."). Confirm the existing pack facet is OR-within-facet before
emitting a multi-`pack=` cycle link; do not invent a new operator.

---

## 5. Advanced card search: Pack → Set, newest first

- Rename the `/cards/advanced` row label (and FacetPicker `label` / placeholder) from Pack to
  Set. Hint can stay "Pick one or more…".
- **Already a multi-select** (`FacetPicker`). Do not replace it with a native `<select multiple>`.
- Sort options by `dateRelease` descending, nulls last, then `name` for ties. Same sort on
  `/decklists/advanced`'s Pack row (rename that label to Set too, for consistency). Filter-summary
  label `"Pack"` → `"Set"` in `src/lib/search/filter-summary.ts` (`FACET_PARAMS`).
- Change the `pack=` SQL from `Card.packCode = ANY(...)` to JSONB containment on
  `raw.attributes.card_set_ids` (any printing). Shared `buildFacetConditions` — simple search
  `pack=` changes with it. Update the System Gateway count in tests from 75 to 77, re-derived
  live, not copied from this plan.

URL param name stays `pack`.

---

## 6. `/sets` index, linked from the header

New route `src/app/sets/page.tsx`, listed in `SiteHeader` after Formats.

A table (or semantically equivalent grid of rows) matching NRDB's `/en/sets` columns:

| Name | Cards | Release Date | Standard | Startup | Eternal |

- Same cycle-grouping rules as section 3, but over **every** pack, not one pool. Newest-first.
- Name is a link (section 4).
- Cards = `Pack.size` (cycle header = sum of children).
- Date = `Pack.dateRelease` (cycle header = latest child).
- Checkmarks for Standard / Startup / Eternal only (not ram / snapshot / core / system_gateway).
  A **set** is in a format iff at least one card printed in that set
  (`card_set_ids` contains the pack code) currently lists that format's `activeCardPoolId` in
  `card_pool_ids`. A **cycle header** is in a format iff any child set is. Do **not** use
  `CardPool.cardCycleIds` alone for checkmarks — Terminal Directive Cards vs Campaign would
  collapse to the same answer, and NRDB treats them differently.

Empty checkmark cells stay empty, not a "no". No new client JS; this is a server-rendered table.

Draft (null date) sorts last. Include every synced pack; do not hide campaign/draft just because
they have no constructed-format checkmarks.

---

## 7. Card-search list view shows the set name, separately

`CardResultsList` list view (`src/components/card-results.tsx`) currently renders title plus
`{faction} - {type} - {side}` in one right-hand `<span>`.

Add the set name (`Pack.name` via `CardSummary.packCode`) as its **own** element, not
interpolated into that string. Suggested layout: title on the left; set name as a distinct
muted span; existing faction/type/side span unchanged. Cards with `packCode == null` omit the
set span.

List view only. Grid / checklist / names stay as they are.

The results queries already `SELECT "packCode"`. Resolve names with one `prisma.pack.findMany`
(75 rows) in the page/component that already has the items, or a small code→name map passed
into `CardResultsList`. Do not N+1.

---

## 8. Decklist card rows: metadata, set, sort by set

`/decklists/[id]` card rows today: title, `x{qty}`.

Each row gains, visually separated the same way as section 7:

- Quantity still visible (keep `xN` or qty-first; pick one and use it throughout the page).
- Faction / type / side, via `formatCode`, same string as card search.
- Set name via `packCode` → `Pack.name`.
- Influence pips (section 9) on this same row.

New sort link **Set**, next to Type / Faction / Name. Comparator groups by `packCode`, and
orders those groups by `Pack.dateRelease` descending (then name). Needs the Pack date from
section 0; load packs for the codes on the deck once.

This is original-printing set (`packCode`), not latest reprint. That is slightly worse for
"which booster do I buy in 2026" and much cheaper than parsing `card_set_ids[0]` per card.
Accept it; do not invent a second pack column this phase.

---

## 9. Decklist layout: section headers, influence, agenda points

When `order` is `type`, `faction`, or `set` (not `name`), wrap the flat `<ul>` as sections:

- A heading per group: `Agenda (9)` — display name via `formatCode(typeCode)` / faction /
  pack name, count is **quantity-sum**, not row-count.
- Cards listed under that heading.
- Group order = the existing comparator's group order (type/faction already `localeCompare` on
  the code, which for corp types is agenda → asset → ice → operation → upgrade — the same order
  as the jinteki.net example). Do not invent a custom type ranking.

Name sort stays a flat list.

Header stats, under the identity line, computed from the non-identity slots plus the identity
row:

- `{n} cards` — already present; keep it.
- **Influence: used/limit**, with used filled pips (Unicode `●`, `influence_cost * quantity`
  when `card.factionCode !== identity.factionCode`; in-faction is 0). Limit is
  `identity.raw.attributes.influence_limit` (null → show used only, no `/15`). Read from `raw`;
  do not add columns.
- **Agenda points: N** — sum of `agenda_points * quantity`, **corp decks only**
  (`identity.sideCode === "corp"`). Hide on runner.

Do **not** add a "Standard legal" / format-legality line. A decklist has no single format; Phase
10's tournament-legal check is a search filter, not a per-deck badge, and guessing Standard
would be dishonest.

Identity stays in the header, not in the card list (existing exclusion).

Extract grouping + influence/agenda arithmetic into a small pure module next to
`decklist-card-order.ts` (e.g. `src/lib/decklist-view.ts`) with unit tests against real card
shapes (in-faction Seamless Launch in an HB deck → 0 paid influence; the same card in NBN →
2 pips per copy; Hedge Fund → 0; identity `influence_limit` 15).

---

## Explicitly out of scope

- True deck-wide MWL / points-budget / `universal_faction_cost` / `global_penalty` (still
  Phase 8/10's deferral).
- A visible Banned (or Restricted / Points) picker on `/cards/advanced`.
- Simple-search prefixes for banned or set (`b:`, `e:`).
- Renaming the `Pack` Prisma model or the `pack=` query param.
- Changing `Card.packCode`'s original-printing heuristic.
- "Standard legal" (or any format) badge on a decklist.
- Restricted/points search links on the format page.
- A "N legacy restrictions hidden" note.
- Deployment / hosting.

## Testing (repo-wide)

Same Vitest conventions as every prior phase: no mocking, real Postgres for DB-backed tests,
pure-function tests for classifiers, grouping, influence, and param parsing.

Minimum new cases:

- `mapCycle` / `mapPack` (Borealis multi-set, single-set cycle, null `date_release` draft).
- `parseAdvancedCardSearchParams` banned parsing (`1`/`0`/blank/garbage) and no-op without
  format.
- `format=standard` current-pool count (re-pin 613 from `psql`, not from this doc).
- `format=standard&banned=1` → 29, set-equal to `getFormatCardStatus` banned codes;
  `banned=0` → 584; `banned=1` without format → unfiltered total.
- `pack=system_gateway` → 77 (card_set_ids), not 75 (packCode).
- Restriction-history render: past rows only inside `<details>` (unit-test the split, curl the
  page).
- Decklist grouping: type sections quantity-sum; name sort has no headings.
- Influence: in-faction / out-of-faction / neutral.

## Verification

Full `PROJECT_PLAN.md` "Phase verification standards": typecheck/lint, `pnpm test`, dev
boot+curl, a **separate** production `build`+`start`+curl, tests passing.

Because section 0 adds a migration: `psql \d` on `Cycle` / `Pack`, GIN-index survival (`\di`),
row counts vs live `/card_cycles` and `/card_sets` (not the sync log line).

Feature curls (dev and production), HTML pretty-printed, counting real DOM not the RSC
`self.__next_f` duplicate:

- `/formats/standard` — legal-cards link present with `format=standard&banned=0`; banned heading
  link with `banned=1`; exactly the active+scheduled restrictions outside `<details>`; past
  restrictions only inside; active card pool visible; set names (Vantage Point, Elevation,
  Borealis as a group) only inside the card-pool `<details>`; numbered rotations still present
  once expanded.
- `/formats/ram` — legal-cards link without `banned=`; no banned link; no restriction expander;
  empty-history sentence unchanged.
- `/cards/advanced/results?format=standard&pageSize=1` → **613**;
  `...&banned=1` → **29**; `...&banned=0` → **584** (re-derive at verify time).
- `/cards/advanced/results?pack=system_gateway&pageSize=1` → **77**.
- `/sets` — 200, linked from the header; Standard/Startup/Eternal columns; Vantage Point has
  all three checkmarks; Borealis is a cycle header with nested Parhelion / Midnight Sun;
  clicking a set lands on advanced results.
- `/cards` list view — a known card shows a set name **outside** the `Faction - Type - Side`
  string.
- A known `/decklists/[id]` — type sort shows `Agenda (` / `Operation (` headings; `order=set`
  is a link; influence used/limit appears; a corp deck shows agenda points; a runner deck does
  not.

No `$queryRawUnsafe` / string-concat SQL in new files. Visual/interactive collapse of `<details>`
cannot be proven by curl beyond "the tags exist and the past rows are inside them"; say that
plainly in the task report.

Once verification passes, `agent-reports/phase-11.md` is the task report per `AGENTS.md`.
