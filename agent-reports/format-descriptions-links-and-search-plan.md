# Formats: descriptions, links, and search-filter — design pass

Planning-only pass (no code/schema changed). Scope: (1) where to store a
human-readable description per format, (2) linking formats from the card
detail page and homepage, plus a `/formats` list + `/formats/[id]` detail
page, (3) format as a search/filter criterion on `/cards`. Decklists search
is explicitly out of scope per the repo owner.

## 1. Background (prior research this session — cited, not re-derived)

Two prior subagent passes this session established the following; repeated
here as given context, not re-investigated:

**What the six NRDB "Format" rows mean** (confirmed via nullsignal.games):

- **Standard** — flagship rotating format. Pool = the two non-rotating Core
  Sets (System Gateway + Elevation) plus the most recent complete cycles
  (currently Ashes, Borealis, Liberation, plus newest release Vantage
  Point). Oldest cycle drops when a new one completes. Simple ban list (19
  Corp/13 Runner banned currently).
- **Startup** — smaller, newer-player-focused. Core Sets + the single most
  recent complete cycle + the current incomplete cycle ("never more than
  five sets"), always trailing Standard. Own ban list (5 Corp/1 Runner) plus
  a deckbuilding cap on high-value agendas.
- **Eternal** — no rotation, essentially every card ever printed. Uses a
  **points list** (7-point budget on restricted cards, plus a small
  outright-banned set) instead of a ban list — deliberately more minimalist
  given the much bigger pool.
- **Snapshot** — frozen, point-in-time format: pool fixed at whatever was
  legal in FFG organized play on 2018-11-16 (Creation and Control through
  Reign and Reverie). Own frozen banned/restricted lists.
- **Random Access Memories (`ram`)** — not a fixed format: every two weeks
  NSG livestreams a random draw of 2 large releases + 12 data packs (from an
  eligible pool, 6 known-bad sets excluded), legal for the next two weeks.
  No ban list at all. Originated as a Worlds "Mystery Box" side event,
  became recurring official format Dec 2021. (No confirmed Daft Punk
  reference in the name — not substantiated, not asserted.)
- **System Gateway** (`system_gateway`) — the original March 2021
  starter-set-only pool, predating the *Elevation* expansion NSG's current
  materials now bundle with it as "Core Sets." No ban list.
- Confirmed: `ram` and `system_gateway` having a blank
  `activeRestrictionId` in jinteki's synced `Format` table is correct/
  expected (both genuinely have no ban list), not a sync gap.

**Current app state re: formats** (confirmed via code review + a live
`pnpm dev` run):

- `/cards/[code]/page.tsx` renders "Legal in: ...", "Banned in: ...", etc.
  from `src/lib/restrictions.ts`'s `computeCardLegality()`/
  `summarizeLegality()` — as **plain, unlinked text**.
- No dedicated formats/restrictions page exists (`/formats`, `/restrictions`,
  `/mwl` all confirmed live 404s); no nav link to anything format-related in
  `src/components/site-header.tsx`.
- `restrictions.ts`'s functions are scoped to "this one card's legality
  across formats" — no existing function for "everything currently banned/
  restricted in format X."
- `Format` (6 rows: `id`, `name`, `activeRestrictionId`, `raw`) and
  `Restriction` (56 rows: `id`, `name`, `formatId`, `dateStart`, `raw`)
  already exist per `prisma/schema.prisma` — see `agent-reports/phase-6.md`
  for the full sync design.
- `Card.raw.attributes.format_ids` (JSON array, e.g. `["eternal", "ram",
  "snapshot", "standard"]`) is synced for every card and already used by
  `computeCardLegality()`.

## 2. New investigation done this pass

### 2a. Does NRDB's `/formats` v3 API have a description field?

Fetched `https://api.netrunnerdb.com/api/v3/public/formats` live. Full
attribute set on a format resource (example: `eternal`):

```
id: "eternal"
type: "formats"
name: "Eternal"
active_snapshot_id: "eternal_8"
snapshot_ids: [...]
restriction_ids: [...]
active_card_pool_id: "eternal"
active_restriction_id: "eternal_points_list_26_03"
updated_at: "2026-07-17T18:16:15+00:00"
```

**No description, summary, or narrative text field anywhere on the
resource** — only structural metadata (ids, a timestamp, relationship
lists). This matches jinteki's own already-written `FormatAttributes` type
in `src/lib/nrdb/types.ts` (lines 145–153), which has exactly this same
field set plus an index signature and a comment noting it was "confirmed
live (2026-07-30) against GET /formats" — independent confirmation from an
earlier sync-building pass, same conclusion. There is nothing to sync for a
description; NRDB simply doesn't carry this data on the API resource jinteki
already ingests. (NSG's prose lives on nullsignal.games's rules-format pages,
not the API — scraping those would mean a new scraper target with its own
markup/versioning risk, addressed in §3 below.)

### 2b. JSONB containment query: syntax, correctness, and performance

Tested directly against the live DB (2054 `Card` rows, confirmed via
`SELECT count(*) FROM "Card"`).

**Syntax confirmed working**:
```sql
SELECT count(*) FROM "Card"
WHERE raw->'attributes'->'format_ids' @> '"eternal"'::jsonb;
```
`@>` is Postgres's JSONB containment operator; the right-hand side must be a
JSONB *scalar* (`'"eternal"'::jsonb`, a JSON string literal), not a bare SQL
string — `@> 'eternal'` errors, `@> '"eternal"'::jsonb` is the correct form
for "does this JSONB array contain this string element." Cross-checked
against an independent second technique
(`EXISTS (SELECT 1 FROM jsonb_array_elements_text(...) e WHERE e = 'eternal')`)
— both returned exactly 2017 rows for `eternal`, confirming the containment
syntax is correct, not a false positive from some other match shape. Spot
counts across all six formats, all sane relative to each format's known pool
size: `eternal` 2017, `standard` 2016, `snapshot` 1181, `system_gateway` 77
(matches System Gateway being the small original starter-set-only pool per
the background above).

**Performance measured, not assumed** (same "measure, don't assume"
discipline as `plans/SEARCH_MATCHING.md`):
```
EXPLAIN ANALYZE SELECT code FROM "Card"
WHERE raw->'attributes'->'format_ids' @> '"snapshot"'::jsonb;

Seq Scan on "Card"  (actual time=0.048..13.117 rows=1181 loops=1)
  Filter: (((raw -> 'attributes'::text) -> 'format_ids'::text) @> '"snapshot"'::jsonb)
  Rows Removed by Filter: 873
Execution Time: 13.174 ms
```
13ms sequential scan, no index. This lands squarely in the same
single-digit-to-low-double-digit-millisecond band `SEARCH_MATCHING.md`
established as negligible at this table's size (2054 rows) — **no index
needed** for a first version; a `GIN` index on the JSONB path (or extracting
`format_ids` to a native `String[]` column with the existing `= ANY(...)`
pattern) would only be worth revisiting if the `Card` table grows by roughly
two more orders of magnitude, which isn't realistic for a fixed card game's
catalog.

**The harder "currently legal in format X" query** (membership AND not
currently banned/restricted — i.e. a SQL-expressible equivalent of
`computeCardLegality()`) is also directly queryable, confirmed by joining
against `Format.activeRestrictionId`:
```sql
SELECT c.code FROM "Card" c, "Format" f
WHERE f.id = 'standard'
  AND f."activeRestrictionId" IS NOT NULL
  AND (c.raw->'attributes'->'format_ids') @> to_jsonb(f.id)
  AND NOT (c.raw->'attributes'->'restrictions'->'banned') @> to_jsonb(f."activeRestrictionId")
  AND NOT (c.raw->'attributes'->'restrictions'->'restricted') @> to_jsonb(f."activeRestrictionId");
```
`to_jsonb(f.id)` / `to_jsonb(f."activeRestrictionId")` convert the `Format`
row's plain `text` columns into the JSONB-scalar shape `@>` needs, so the
restriction id can be compared against a JSONB array pulled from a *different
row's* `raw` blob inside the same query — no client-side round trip. Cross-
checked: 29 cards came back for "banned in standard," matching a direct
`jsonb_array_length(Restriction.raw->'attributes'->'verdicts'->'banned')`
count for `standard_ban_list_26_03` (also 29 — see §2c). `EXPLAIN ANALYZE`:
23.5ms (`Nested Loop` over a 1-row `Format` index scan × a 2054-row `Card`
seq scan) — still negligible, but this is meaningfully more complex SQL than
plain membership (see §5 for why this matters for scoping the build).

### 2c. Restriction verdicts are keyed by card code (confirms the stretch goal is buildable, and how)

`Restriction.raw->attributes->verdicts` is an object keyed by card *code*,
not a flat list — confirmed directly:
```sql
SELECT jsonb_object_keys(raw->'attributes'->'verdicts'->'points')
FROM "Restriction" WHERE id = 'eternal_points_list_26_03' LIMIT 5;
-- ddos, sifr, shock, kakugo, snitch  (all real Card.code values)
```
and `jsonb_array_length(raw->'attributes'->'verdicts'->'banned')` for
`standard_ban_list_26_03` = 29, matching §2b's cross-check exactly. This
means "every card currently banned/restricted/pointed in format X" is
answerable today with one query against `Restriction` (find the format's
`activeRestrictionId` row, pull `verdicts.banned`/`.restricted`/
`jsonb_object_keys(verdicts.points)`) followed by a `Card` lookup on those
codes — no new sync or schema needed for the data itself, only new query
code (there is genuinely none today, confirmed per the background above).

## 3. Recommendation 1 — storing a human-readable format description

**Decision: hand-curated seed data, not scraped NSG prose, not a DB-editable
admin table.**

Reasoning, concrete to this schema:

- §2a confirms NRDB's API has nothing to sync — a "just sync it like every
  other field" path doesn't exist. The only source of real prose is NSG's
  own site (nullsignal.games), which is HTML meant for human reading, not a
  stable API contract. Scraping it would mean: a new scraper (`src/sync/
  sync-*.ts`) targeting page markup NSG doesn't version or guarantee, run on
  a schedule for data that changes maybe once every year or two (a new
  format is added vanishingly rarely; existing format *descriptions*
  change only when NSG rewrites its own explainer copy) — a lot of ongoing
  scraper-maintenance risk for six rows that essentially never change.
- This project already has a named pattern for exactly this situation:
  `prisma/rule-mapping-data.ts` — a hand-curated TypeScript data file,
  reviewable as a plain diff, seeded into the DB by `prisma/seed.ts` (upsert
  + reconcile-delete of anything no longer in the file — see that file's
  `main()`). Six format descriptions is an even smaller, even more stable
  case than `rule-mapping-data.ts`'s ~15+ typeCode/keyword rows, so the same
  pattern fits at least as well.
- A DB-editable admin table is overkill here: there's no ongoing curation
  workflow needed (unlike, say, user-submitted content), and it would add an
  admin UI surface for six rows that change on the order of once a year.

**Concrete schema/migration change**:

- Add `description String?` (nullable) to the `Format` model in
  `prisma/schema.prisma`. **Must be nullable**, not required-with-default:
  `src/sync/sync-restrictions.ts`'s `mapFormat()` (line 28) builds the
  `Prisma.FormatUncheckedCreateInput` object passed to `prisma.format.upsert()`
  and does not (and should not) include `description` — Prisma's `update`
  only touches fields present in the passed object, so leaving `description`
  out of `mapFormat()`'s return value means the sync's periodic `pnpm
  sync:restrictions` runs never clobber a seeded description. But that same
  omission means `create` (the very first sync, before the seed has ever
  run) must not fail a NOT NULL constraint — hence nullable. This is the
  same ordering hazard `prisma/schema.prisma`'s own header comment already
  documents for `RuleMapping.ruleSectionId` (a plain string, not a `@relation`,
  specifically to dodge an insert-ordering dependency) — same shape of
  problem, same kind of fix.
- Standard Prisma migration: `npx prisma migrate dev --name
  add_format_description` (or whatever name fits the project's convention),
  verified via direct `psql \d "Format"` introspection per this project's
  established verification standard (`PROJECT_PLAN.md`'s "Phase verification
  standards"), not just a successful migration exit code.
- New seed data file `prisma/format-description-data.ts`, same shape as
  `rule-mapping-data.ts`: `export const formatDescriptionData: { id: string;
  description: string }[]`. `prisma/seed.ts` gets a second loop (alongside
  the existing `ruleMappingData` loop) that upserts `Format.description` by
  `id` for each entry — no reconcile-delete needed here the way
  `RuleMapping` needs one, since `Format` rows themselves are already
  reconciled by `sync-restrictions.ts`'s own delete-cleanup; the seed only
  ever *updates* an existing row's `description` field, it never creates or
  deletes a `Format` row.

**Draft content** (the six format explanations already established in §1,
condensed into description-length prose — a build agent can use these
directly as the seed file's actual values, not just a description of the
approach):

```ts
export const formatDescriptionData = [
  {
    id: "standard",
    description:
      "The flagship rotating format. The card pool is the two non-rotating " +
      "Core Sets (System Gateway and Elevation) plus the most recent complete " +
      "cycles — currently Ashes, Borealis, Liberation, and the newest release, " +
      "Vantage Point. When a new cycle completes, the oldest cycle in the pool " +
      "rotates out. Uses a simple ban list (currently 19 Corp and 13 Runner " +
      "cards banned) rather than a points system.",
  },
  {
    id: "startup",
    description:
      "A smaller format aimed at newer players. The card pool is the Core " +
      "Sets plus only the single most recent complete cycle and the current " +
      "incomplete cycle — never more than five sets at once. It rotates on " +
      "the same cadence as Standard, always trailing one cycle behind. Has " +
      "its own smaller ban list (5 Corp, 1 Runner) plus an extra deckbuilding " +
      "rule capping how many high-value agendas a deck can run.",
  },
  {
    id: "eternal",
    description:
      "The non-rotating format — essentially every card ever printed for " +
      "the game is legal. Instead of a ban list, Eternal uses a points " +
      "system: each deck has a budget (currently 7 points) to spend on cards " +
      "flagged as powerful, plus a small list of cards banned outright. This " +
      "is deliberately a lighter-touch approach than Standard's ban list, " +
      "given how much larger the Eternal card pool is.",
  },
  {
    id: "snapshot",
    description:
      "A frozen, point-in-time format. The card pool is fixed at exactly " +
      "what was tournament-legal under the original publisher's (FFG) " +
      "organized play program on November 16, 2018 — Creation and Control " +
      "through Reign and Reverie. Snapshot has its own frozen banned/" +
      "restricted list from that era and never changes.",
  },
  {
    id: "ram",
    description:
      "Random Access Memories (RAM) isn't a fixed card pool. Every two " +
      "weeks, a new legal pool is drawn live on stream: 2 large releases " +
      "plus 12 data packs, picked from an eligible set (a handful of sets " +
      "are permanently excluded). Whatever's drawn is legal as-is for the " +
      "next two weeks — there's no ban list at all. Originated as a " +
      "'Mystery Box' Worlds side event before becoming a recurring official " +
      "format.",
  },
  {
    id: "system_gateway",
    description:
      "The original March 2021 starter-set card pool — just the cards from " +
      "the System Gateway two-player starter set, predating the later " +
      "Elevation expansion that's now bundled alongside it as part of the " +
      "'Core Sets.' No ban list.",
  },
];
```

## 4. Recommendation 2 — linking formats

### 4a. Card detail page: link "Legal in: ..." / "Banned in: ..." names

`src/lib/restrictions.ts`'s `summarizeLegality()` currently returns
already-joined display *strings* (e.g. `"Legal in: Standard, Startup"`) —
that shape has to change to keep per-format ids around for linking, since
you can't recover which substring corresponds to which `formatId` after
joining. Concretely:

- Change `summarizeLegality()`'s return type from `string[]` to a small
  structured shape per line, e.g.:
  ```ts
  export interface LegalityLine {
    label: string; // "Legal in", "Banned in", "2 pts in", "+1 influence in"
    entries: { formatId: string; formatName: string }[];
  }
  export function summarizeLegality(entries: CardLegalityEntry[]): LegalityLine[]
  ```
  (points/influence lines, which today are one line *per entry* rather than
  grouped, can each become a one-entry `LegalityLine` — same grouping
  behavior as today, just carrying `formatId` through instead of discarding
  it into a plain string.)
- `restrictions.test.ts` already covers `summarizeLegality()`'s grouping and
  ordering behavior — those assertions need updating to the new return
  shape (same test cases, different shape asserted against), not new
  coverage.
- `src/app/cards/[code]/page.tsx` (the block at lines 204–210 rendering
  `legalityLines.map((line) => <p key={line}>{line}</p>)`) changes to render
  each `LegalityLine`'s `label` as plain text followed by its `entries`
  mapped to real links: `<Link href={`/formats/${entry.formatId}`}>{entry.formatName}</Link>`,
  comma-joined. This is the same "turn a facet's plain-text value into a
  link" move `src/components/facet-link.tsx` already does for faction/type/
  side/keyword — reuse that component's pattern (a `FormatLink` component
  with the same shape as `FacetLink`, or extend `FacetLink`'s
  `PARAM_BY_KIND`-style map with a `format` kind that points at
  `/formats/{value}` instead of `/cards?{param}={value}`) rather than
  inventing new markup.

### 4b. Homepage "Formats" section

`src/app/page.tsx` today (confirmed by reading it) is a minimal three-link
nav (`/cards`, `/decklists`, `/rules`) with no format-related content at
all — this is a pure addition, not a restructure. Two small changes:

- `src/app/page.tsx`: fetch `prisma.format.findMany({ orderBy: { name: "asc" } })`
  (6 rows, no pagination/filtering needed, same "always fetch in full"
  treatment `/cards/[code]/page.tsx` already gives the `Format` table at
  line 96) and render a new "Formats" section — a simple list of six
  `<Link href={`/formats/${format.id}`}>{format.name}</Link>` entries,
  visually similar to the existing "Browse Cards / Browse Decklists / Browse
  Rules" button row, or a plainer inline list beneath it (page currently has
  no precedent for a longer list on the homepage, so either treatment is a
  reasonable first pass — the button-row style keeps visual consistency
  with what's already there).
- `src/components/site-header.tsx`: add a `<Link href="/formats">Formats</Link>`
  entry to the persistent nav, in the same position/style as the existing
  `Cards`/`Decklists`/`Rules` links (lines 21–31) — this is the "no nav link
  to anything format-related" gap called out in the background above.

### 4c. New route files: `/formats` and `/formats/[id]`

Both are new files; no existing route to extend.

- **`src/app/formats/page.tsx`** — a `/formats` list page. Six rows, no
  pagination needed (unlike `/cards`/`/decklists`/`/rules`, which all use
  `searchParams`-driven pagination for hundreds/thousands of rows — six rows
  don't need that machinery at all). Simplest correct shape: `prisma.format.findMany({
  orderBy: { name: "asc" } })`, rendered as a plain list, each row = format
  name (linked to `/formats/{id}`) + the new `description` column (§3) as
  a one-line summary — same "list page with a one-line preview linking to a
  detail page" shape `/rules/page.tsx` already uses for `RuleSection`
  (`section.title` linked + `line-clamp-2` body preview at lines 62–70),
  reused here rather than invented fresh.
- **`src/app/formats/[id]/page.tsx`** — a `/formats/[id]` detail page.
  `prisma.format.findUnique({ where: { id } })`, 404 via `notFound()` if
  missing (same pattern as `/cards/[code]/page.tsx` lines 43–50). Render the
  full `description`, the format's `name`, and — since `Restriction` already
  has a `formatId` FK — optionally its restriction history
  (`prisma.restriction.findMany({ where: { formatId: id }, orderBy: {
  dateStart: "desc" } })`, e.g. "Standard Ban List 26.03 (active),
  Standard Ban List 25.09, ..." with the currently-active one — matched
  against `Format.activeRestrictionId` — visually distinguished).

**Stretch goal, explicitly flagged as separate new work, not a trivial
addition**: "which cards are currently banned/restricted/pointed in this
format" on the `/formats/[id]` page. §2c confirmed the *data* already
exists and is queryable (`Restriction.raw->attributes->verdicts`, keyed by
card code), but there is genuinely no existing function for this today —
it needs a new query function (e.g. `src/lib/restrictions.ts` or a new
`src/lib/search/format-cards.ts`) that: (1) finds the format's active
`Restriction` row, (2) pulls `verdicts.banned` / `verdicts.restricted` /
`Object.keys(verdicts.points)` as card-code arrays, (3) looks those up
against `Card` (`prisma.card.findMany({ where: { code: { in: [...] } } })`),
(4) groups the results back into banned/restricted/points sections for
display. This is a real, bounded, but non-trivial addition — plan for it as
its own build item, not a one-line extension of the detail page.

## 5. Recommendation 3 — format as a `/cards` filter

Two possible filters exist here, with a real complexity gap between them —
build the simpler one first.

### Option A (recommended for v1): filter by format *membership*

"Show cards whose `format_ids` includes format X" — i.e. cards in that
format's card pool, regardless of current ban/restriction status.

- **Query shape**: extends `src/lib/search/cards.ts`'s existing
  `conditions.push(...)` pattern exactly like the `keyword` filter does
  today (line 175–180, `${params.keyword} = ANY("keywords")` against
  `Card.keywords`, a native Postgres `String[]` column). The format
  equivalent targets a JSONB path instead of a native array column, since
  `format_ids` lives inside `Card.raw` (there's no native `Card.formatIds`
  column — see the schema in `prisma/schema.prisma`, `Card` only has
  `keywords String[]` as a native array, everything format-related is
  nested in `raw`). Confirmed-working shape (§2b):
  ```ts
  if (params.format) {
    conditions.push(
      Prisma.sql`(raw->'attributes'->'format_ids') @> to_jsonb(${params.format}::text)`,
    );
  }
  ```
  (`to_jsonb(${params.format}::text)` rather than a literal
  `'"eternal"'::jsonb` string, so the parameter stays a properly
  Prisma-parameterized bound value, consistent with this file's existing
  "never raw string concatenation" rule stated in its own file header.)
- **`CardSearchParams`**: add `format?: string`, parsed in
  `parseCardSearchParams()` with the same trim/blank-to-undefined treatment
  every other field already gets (mirrors `pack`'s handling exactly, lines
  123 and 151 in the current file).
- **`src/app/cards/page.tsx`**: a `<select name="format">` alongside the
  existing Faction/Side/Type/Keyword/Pack selects, options from
  `prisma.format.findMany({ orderBy: { name: "asc" } })` (a sixth parallel
  `Promise.all` entry, same shape as the existing `factions`/`typeRows`/
  `keywordRows`/`packs` queries at lines 67–79) — labeled by `Format.name`
  directly (already human-readable, e.g. "System Gateway" — no `formatCode()`
  needed, unlike faction/type/keyword's lowercase-underscore raw codes).
- **Performance**: §2b measured this exact containment query at 13ms
  sequential scan against the real 2054-row table — well within
  `SEARCH_MATCHING.md`'s established "negligible" band. **No index needed**
  for a first version. If this table grows dramatically (unlikely for a
  fixed-catalog card game), a `GIN` index on the JSONB path
  (`@@index([raw], type: Gin)` with a JSONB-specific operator class Prisma's
  DSL can't express directly — would need the same hand-written-SQL-plus-
  `map:`-declaration workaround this schema already uses for its five
  `pg_trgm` indexes, per `prisma/schema.prisma`'s file-header comment) would
  be the next step, not needed now.
- **Test**: extend `cards.test.ts` with a real-DB case mirroring the plan
  for `pack` in `PHASE_6_PLAN.md` item 1 — `searchCards({ format: "system_gateway" })`
  returns exactly the cards with `"system_gateway"` in `format_ids`,
  cross-checked against a direct count query (77, per §2b's spot check).

### Option B: filter by *currently legal* in format X (excludes currently banned/restricted/pointed-out cards)

Materially harder, and the gap is real, not cosmetic:

- `computeCardLegality()` (`src/lib/restrictions.ts`) is pure TypeScript
  logic today — it has never been expressed as SQL, and porting it means
  re-deriving its branching (membership → banned → restricted → points →
  influence → legal, in that priority order) as a SQL `WHERE` condition
  cross-referencing `Card.raw`'s `restrictions` blob against
  `Format.activeRestrictionId`. §2b's investigation shows this *is*
  possible — the join query there (`NOT (...banned @> ...) AND NOT
  (...restricted @> ...)`) is a working proof of a simplified two-state
  (banned/restricted vs. everything else) version, measured at 23.5ms, still
  cheap — but a *complete* port (also correctly excluding "legal" from
  points/influence-cost cards, if "currently legal" is meant to exclude
  those too, which is a real product-semantics question this design
  doesn't resolve on its own) is more SQL surface than a simple
  `= ANY(...)`/`@>` filter, and it's logic that would then exist in two
  places (TypeScript for the card-detail-page display, SQL for the filter)
  needing to be kept in sync — a real maintenance cost the simpler option
  doesn't have.
- Also needs a `Format`-to-`Card` join in `searchCards()`'s query (today's
  function only ever touches the single `Card` table plus literal
  parameters — this would be the first cross-table condition in that file),
  a bigger structural change than adding one more `Prisma.sql` condition to
  the existing list.

**Recommendation**: build Option A first. It's a direct, low-risk extension
of an established pattern (`keyword`'s array-containment filter, just
against a JSONB path instead of a native array — confirmed low-cost via
§2b), answers the most common real user question ("what cards exist in
Startup's pool?"), and doesn't require inventing new cross-table SQL logic.
Option B is real, wanted functionality (surfacing "and it's currently
banned/restricted there too" as a filterable fact) but should be scoped as
its own follow-up once Option A's UI/query pattern is in place and once the
points/influence-cost semantics question above is explicitly decided — not
bundled into the same first pass.

## 6. Summary of concrete file changes for a build phase

| Area | Files |
|---|---|
| Format description (§3) | `prisma/schema.prisma` (+`description String?` on `Format`), new migration, new `prisma/format-description-data.ts`, `prisma/seed.ts` (+seed loop) |
| Card-detail legality links (§4a) | `src/lib/restrictions.ts` (`summarizeLegality()` return shape), `src/lib/restrictions.test.ts`, `src/app/cards/[code]/page.tsx` (render links), possibly `src/components/facet-link.tsx` (add a `format` kind) or a new small `FormatLink` component |
| Homepage + nav (§4b) | `src/app/page.tsx` (new Formats section + `prisma.format.findMany` fetch), `src/components/site-header.tsx` (+nav link) |
| New format pages (§4c) | `src/app/formats/page.tsx` (new), `src/app/formats/[id]/page.tsx` (new); stretch: a new query function (e.g. `src/lib/restrictions.ts` addition or new `src/lib/search/format-cards.ts`) for "cards currently banned/restricted/pointed in format X" |
| `/cards` format filter (§5, Option A) | `src/lib/search/cards.ts` (+`format` param, +condition, +test), `src/app/cards/page.tsx` (+`<select name="format">` + `prisma.format.findMany` fetch) |

No changes were made to any application code or the schema during this
pass — all queries above were run read-only against the live dev DB
(`docker compose exec postgres psql ...`), and the NRDB API was fetched
read-only.

## 7. Verification (for the build phase)

Added during review of this plan, before any build starts — these are the
checks a build agent's own verification pass should run, and independently
the exact checks a separate verification-only subagent should re-run against
the finished result. Every check is stated as a concrete command plus an
expected real value (many taken directly from this plan's own §2 measurements),
not "should work" — matching `PROJECT_PLAN.md`'s "Phase verification
standards," applied specifically to what this plan describes.

### 7.0 Standing project-wide standards (apply as always)

- Typecheck (`npx tsc --noEmit`) and lint (`npx eslint .`) clean.
- `pnpm dev` boots, real `curl` against the homepage returns 200.
- **Separate** production check: `pnpm build` then `pnpm start`, same curl
  battery re-run against the production server — not skipped just because
  dev-mode passed (this project has caught a real bug this exact way before,
  Phase 3's `AUTH_TRUST_HOST` issue).
- `pnpm test` passes, including whatever new/updated tests this build adds
  (`restrictions.test.ts`'s updated `summarizeLegality()` assertions,
  `cards.test.ts`'s new `format` filter case).
- No new auth-gated routes are introduced by this plan (formats/cards
  browsing is all public, read-only) — confirm nothing accidentally added an
  auth requirement that shouldn't be there, rather than skipping this
  standard as "not applicable."

### 7.1 Schema change — direct introspection, not a trusted migrate exit code

- `docker compose exec postgres psql -U jinteki -d jinteki -c "\d \"Format\""`
  — confirm a `description` column exists, type `text`, **nullable** (no
  `NOT NULL` constraint) — the nullability is load-bearing (§3's reasoning),
  not incidental, so confirm it explicitly rather than just "the column
  exists."
- **Migration-safety check specific to this project's own history**: this
  session already had a real incident where an auto-generated
  `prisma migrate dev` migration silently dropped all five `pg_trgm` GIN
  indexes (see `prisma/schema.prisma`'s header comment and
  `agent-reports/phase-6.md`). Before applying the new migration, read its
  generated `migration.sql` and confirm it contains **no**
  `DROP INDEX ".*_trgm_idx"` lines. After applying, confirm directly:
  `docker compose exec postgres psql -U jinteki -d jinteki -c "\di" | grep trgm`
  must still show all five (`Card_title_trgm_idx`, `Card_text_trgm_idx`,
  `Decklist_name_trgm_idx`, `RuleSection_title_trgm_idx`,
  `RuleSection_bodyText_trgm_idx`) — this is a direct regression test for a
  bug that has already happened once for real in this exact codebase, not a
  hypothetical concern.
- Take a `pg_dump` backup first and preview via `prisma migrate dev
  --create-only` before applying, same safe procedure already established
  and documented in `prisma/pg_dump/README.md` earlier this session — don't
  run a bare `prisma migrate dev` directly against the real dev database.

### 7.2 Seed data — real content, and proven not to be clobbered by sync

- `docker compose exec postgres psql -U jinteki -d jinteki -c "SELECT id, description IS NOT NULL AS has_desc FROM \"Format\" ORDER BY id;"`
  — all 6 rows must show `has_desc = t`. Spot-check at least one row's full
  text (`SELECT description FROM "Format" WHERE id = 'ram';`) actually
  contains real prose (e.g. mentions "two weeks" and "no ban list"), not a
  placeholder.
- **The specific hazard this plan's design is meant to avoid**: re-run
  `pnpm sync:restrictions` (or trigger it via the real admin session cookie
  against `/api/admin/sync/restrictions`, the established technique) *after*
  seeding, then re-run the query above — all 6 rows must **still** show
  `has_desc = t` with unchanged text. If any description went null/changed
  after a sync run, `mapFormat()` incorrectly included `description` in its
  upsert payload — a real bug in this exact design, not a hypothetical.

### 7.3 Card-detail legality links

- `curl http://localhost:3000/cards/15_minutes` (a card already confirmed in
  this session to be legal in eternal/ram/snapshot/standard) — grep the
  response for `href="/formats/` and confirm exactly 4 such links appear for
  this card, each pointing at one of `eternal`/`ram`/`snapshot`/`standard`
  (not fewer — a missed format — and not more, e.g. duplicated across the
  rendered HTML and RSC flight payload the way plain text has shown up
  twice in this app before; if duplication is present, confirm it's the
  same known RSC-payload-echo pattern already observed for other fields in
  this session, not a real UI bug rendering the line twice).
- Confirm the link text matches the format's real `name` (e.g. "Random
  Access Memories", not the raw id `ram`), and confirm each link's `href`
  resolves to a real 200 (§7.4).

### 7.4 Homepage, nav, and the new `/formats` pages

- `curl http://localhost:3000/` — grep for a "Formats" section; confirm
  exactly 6 links to `/formats/{id}`, and that the 6 ids match
  `SELECT id FROM "Format" ORDER BY id;` exactly (set equality, not just a
  count of 6 — a bug could show 6 *wrong* links).
- `curl http://localhost:3000/cards` (or any other page) — confirm the
  persistent nav (`site-header.tsx`) also shows a "Formats" link, not just
  the homepage — this is a global nav addition, not a homepage-only one.
- `curl http://localhost:3000/formats` — 200; confirm all 6 format names
  and their real `description` text (or a truncated preview of it) appear.
- `curl http://localhost:3000/formats/eternal` — 200; confirm the full
  description text and the format name are both present.
- `curl http://localhost:3000/formats/not_a_real_format` — must 404 (via
  `notFound()`), confirmed with a real request, not assumed from the code
  having a `notFound()` call.
- If the restriction-history stretch item was built on `/formats/[id]`:
  cross-check the restriction names shown for a format against
  `SELECT name FROM "Restriction" WHERE "formatId" = 'eternal' ORDER BY "dateStart" DESC;`
  and confirm the one matching `Format.activeRestrictionId` is visually
  marked as active.
- If the "cards currently banned/restricted/pointed in this format" stretch
  item was built: for `standard`, cross-check the exact set of banned card
  codes shown against
  `SELECT jsonb_array_elements_text(raw->'attributes'->'verdicts'->'banned') FROM "Restriction" WHERE id = 'standard_ban_list_26_03';`
  — this plan's own §2c measured this at 29 cards; the rendered page must
  show exactly those 29 codes, not just "some cards" or a plausible-looking
  count.

### 7.5 `/cards` format filter

- `curl "http://localhost:3000/cards?format=system_gateway"` — extract the
  rendered card count and the set of card codes/links present; cross-check
  against `SELECT count(*) FROM "Card" WHERE raw->'attributes'->'format_ids' @> '"system_gateway"'::jsonb;`
  — this plan's own §2b measured this at **77** for `system_gateway` (and
  2017/2016/1181 for eternal/standard/snapshot respectively) — an exact
  match is required, not an approximate one.
- Combine with an existing filter to confirm AND-semantics, mirroring
  Phase 6's `pack`+`faction` combined test:
  `curl "http://localhost:3000/cards?format=eternal&faction=anarch"` —
  cross-check against
  `SELECT count(*) FROM "Card" WHERE raw->'attributes'->'format_ids' @> '"eternal"'::jsonb AND "factionCode" = 'anarch';`
- Confirm the new `format` `<select>` on `/cards` is populated with all 6
  real `Format.name` values (not raw ids), and that selecting one and
  submitting reproduces the same URL/result as typing the query param by
  hand.
- If Option B (currently-legal-in-format filtering) was built instead of or
  in addition to Option A: verify it separately using the two-state
  banned/restricted join query from §2b (measured 23.5ms) as the
  cross-check basis, and confirm explicitly which product-semantics
  decision was made for points/influence-cost cards (§5's open question) —
  don't let this ship with an unstated assumption about what "currently
  legal" means for those cases.
