# Format descriptions, links, and search filter — build report

Build phase for `agent-reports/format-descriptions-links-and-search-plan.md`
(all of §3/§4/§5-Option-A/§6). All items in scope were built; no items were
deferred out of this pass.

## §3 — Format.description schema + seed data

- `prisma/schema.prisma`: added `description String?` (nullable, per the
  plan's explicit reasoning about `sync-restrictions.ts`'s `mapFormat()`
  never setting it) to the `Format` model, with a comment cross-referencing
  the plan and the file's own existing `RuleMapping.ruleSectionId` precedent.
- New migration `prisma/migrations/20260803071858_add_format_description/`.
  Generated via `npx prisma migrate dev --create-only --name
  add_format_description` first (touches only the throwaway shadow DB), then
  read in full before applying:
  ```sql
  -- AlterTable
  ALTER TABLE "Format" ADD COLUMN     "description" TEXT;
  ```
  One additive line, no `DROP INDEX` of any kind — confirmed clean per the
  project's own documented `pg_trgm`-index-drop hazard before applying for
  real via `npx prisma migrate dev`.
- New `prisma/format-description-data.ts` — the six format descriptions from
  the plan's §3, copied verbatim (not rewritten).
- `prisma/seed.ts` — added a second loop after the existing `ruleMappingData`
  loop. Deliberately uses `prisma.format.updateMany({ where: { id }, data:
  { description } })` per entry, **not** `upsert`: the plan's own reasoning
  is that this seed must never create/delete a `Format` row (that's
  `sync-restrictions.ts`'s job) — `updateMany` is a no-op instead of
  throwing if the row doesn't exist yet, so the seed doesn't have a
  hidden ordering dependency on `sync:restrictions` having already run.
  Logs `Updated description on N/6 Format row(s)`.

### Verification (§7.1, §7.2 — real commands/output)

- `pg_dump` backup taken first: `prisma/pg_dump/jinteki_20260803071839.dump`
  (per `prisma/pg_dump/README.md`'s documented procedure).
- Direct introspection, not trusted exit code:
  ```
  $ docker compose exec postgres psql -U jinteki -d jinteki -c '\d "Format"'
                      Table "public.Format"
         Column        | Type  | Collation | Nullable | Default
  ---------------------+-------+-----------+----------+---------
   id                  | text  |           | not null |
   name                | text  |           | not null |
   activeRestrictionId | text  |           |          |
   raw                 | jsonb |           | not null |
   description         | text  |           |          |
  ```
  `description` is `text`, nullable (no `not null`) — confirmed, not assumed.
- Trigram indexes, before AND after applying the migration:
  ```
  $ docker compose exec postgres psql -U jinteki -d jinteki -c '\di' | grep trgm
   Card_text_trgm_idx
   Card_title_trgm_idx
   Decklist_name_trgm_idx
   RuleSection_bodyText_trgm_idx
   RuleSection_title_trgm_idx
  ```
  All five present after applying — no regression of the documented incident.
- Seed data, real content:
  ```
  $ npx prisma db seed
  Seeded 28 RuleMapping row(s), deleted 0 orphaned row(s).
  Updated description on 6/6 Format row(s).

  $ psql -c 'SELECT id, description IS NOT NULL AS has_desc FROM "Format" ORDER BY id;'
   eternal | t
   ram | t
   snapshot | t
   standard | t
   startup | t
   system_gateway | t

  $ psql -c "SELECT description FROM \"Format\" WHERE id = 'ram';"
   "Random Access Memories (RAM) isn't a fixed card pool. Every two weeks,
   a new legal pool is drawn live on stream ... there's no ban list at all. ..."
  ```
  Real prose, mentions "two weeks" and "no ban list" — not a placeholder.
- The specific hazard the design guards against: re-ran `pnpm
  sync:restrictions` after seeding (`[sync:restrictions] SUCCESS - 62
  records`), then re-ran the same query — all 6 rows still `has_desc = t`,
  confirming `mapFormat()`'s omission of `description` doesn't clobber the
  seeded values on a real sync run.

## §4a — Card-detail legality links

- `src/lib/restrictions.ts`: `summarizeLegality()`'s return type changed
  from `string[]` to the plan's `LegalityLine[]` shape (`{ label, entries:
  { formatId, formatName }[] }`), same grouping/ordering behavior as before
  (legal, banned, restricted, points, influence), just carrying `formatId`
  through instead of discarding it into a joined string.
- `src/lib/restrictions.test.ts`: all four `summarizeLegality` test cases
  updated to assert the new structured shape (same scenarios, different
  expected shape) — no new coverage needed, per the plan.
- New `src/components/format-link.tsx` — a **sibling** to `FacetLink`, not
  an extension of it. Decision reasoning: `FacetLink`'s `PARAM_BY_KIND` map
  exists specifically to build `/cards?{param}={value}` filter links labeled
  via `formatCode(rawCode)`; a format link needs a materially different
  href (`/formats/{formatId}`, a detail page, not a `/cards` filter) and a
  materially different label source (`entry.formatName`, already
  human-readable — not something to derive via `formatCode()` from a raw
  id like `"ram"`). Folding this into `FacetLink` would mean special-casing
  away most of what `PARAM_BY_KIND` is for, so a small sibling component was
  the better fit once both were read in full.
- `src/app/cards/[code]/page.tsx`: the `legalityLines.map((line) => <p
  key={line}>{line}</p>)` block replaced with a block that renders each
  line's `label` as text and each `entries` array as comma-joined
  `<FormatLink>` components.

### Verification (§7.3 — real curl against `/cards/15_minutes`)

```
$ curl http://localhost:3000/cards/15_minutes
$ grep -o 'href="/formats/[a-z_]*"' | sort | uniq -c
      1 href="/formats/eternal"
      1 href="/formats/ram"
      1 href="/formats/snapshot"
      1 href="/formats/standard"
```
Exactly 4 links, no duplication, matching eternal/ram/snapshot/standard
exactly (not fewer, not more). Link text confirmed human-readable:
`Snapshot`, `Eternal`, `Standard`, `Random Access Memories` (not the raw id
`ram`). Re-confirmed identically against the production build (see §7.0
below).

## §4b — Homepage + nav

- `src/app/page.tsx`: converted to an async server component, fetches
  `prisma.format.findMany({ orderBy: { name: "asc" } })` and renders a new
  "Formats" section below the existing button row — a plain wrapped list of
  6 dotted-underline links to `/formats/{id}`, visually distinct from (but
  consistent with) the existing button-row style.
- `src/components/site-header.tsx`: added a `<Link href="/formats">Formats
  </Link>` entry in the persistent nav, same position/style as the existing
  Cards/Decklists/Rules links.

### Verification (§7.4)

```
$ curl http://localhost:3000/ | grep -o 'href="/formats/[a-z_]*"' | sort -u
href="/formats/eternal"
href="/formats/ram"
href="/formats/snapshot"
href="/formats/standard"
href="/formats/startup"
href="/formats/system_gateway"

$ psql -c 'SELECT id FROM "Format" ORDER BY id;'
eternal / ram / snapshot / standard / startup / system_gateway
```
Set equality confirmed — the 6 homepage links are exactly the 6 real
`Format.id` values, not 6 wrong-but-plausible-looking ones.

```
$ curl http://localhost:3000/cards | grep -o 'href="/formats"'
href="/formats"
```
Confirmed the nav link is global (present on `/cards`, not homepage-only).

## §4c — New `/formats` and `/formats/[id]` pages, plus the stretch goal

- New `src/app/formats/page.tsx` — list page, `prisma.format.findMany`, no
  pagination (6 rows), same "linked title + line-clamp-2 preview" shape
  `/rules/page.tsx` already uses for `RuleSection`.
- New `src/app/formats/[id]/page.tsx` — detail page, `notFound()` via
  `prisma.format.findUnique` returning null (same pattern as
  `/cards/[code]/page.tsx`). Renders name + full description, a restriction-
  history list (`prisma.restriction.findMany({ where: { formatId: id },
  orderBy: { dateStart: "desc" } })`) with the currently-active one (matched
  against `Format.activeRestrictionId`) bold + tagged "active", and the
  stretch-goal banned/restricted/points sections.
- **Stretch goal, built as scoped in-scope work per the task**: new
  `src/lib/search/format-cards.ts` exporting `getFormatCardStatus
  (activeRestrictionId: string | null)`. Takes the format's
  `activeRestrictionId` directly (not a `formatId`) since every current
  caller (`/formats/[id]/page.tsx`) has already fetched the `Format` row for
  its own name/description/404 handling — a second Format lookup here would
  be a redundant round trip. Looks up the matching `Restriction` row, reads
  `raw.attributes.verdicts.{banned,restricted,points}` (keyed by card code,
  per the plan's §2c), resolves codes to titles via one `prisma.card.
  findMany({ where: { code: { in: [...] } } })`, and returns three
  title-sorted groups. Returns all-empty groups (not an error) when
  `activeRestrictionId` is null — the correct behavior for `ram`/
  `system_gateway`, which genuinely have no ban list.

### Verification (§7.4 — real curls + direct DB cross-checks)

```
$ curl http://localhost:3000/formats               -> 200
$ curl http://localhost:3000/formats/eternal        -> 200 (name + full description present)
$ curl http://localhost:3000/formats/not_a_real_format -> 404 (real request, not code inspection)
```

Restriction history, cross-checked against direct DB query for `eternal`:
```
$ psql -c 'SELECT name FROM "Restriction" WHERE "formatId" = '"'"'eternal'"'"' ORDER BY "dateStart" DESC;'
Eternal Points List 26.03 / 25.07 / 25.04 / 23.11 / 23.03 / 22.09 / 21.11 / Version 1.0
```
All 8 names present on the rendered page; `activeRestrictionId` for eternal
is `eternal_points_list_26_03` and the rendered page marks "Eternal Points
List 26.03" with the "active" badge — matches.

Stretch-goal cross-check, `standard`'s banned list (the plan's own §2c
measurement: 29 cards):
```
$ psql -c "SELECT jsonb_array_length(raw->'attributes'->'verdicts'->'banned')
           FROM \"Restriction\" WHERE id = 'standard_ban_list_26_03';"
29
```
Extracted the 29 real codes via `jsonb_array_elements_text(...)`, extracted
every `/cards/{code}` link under the rendered page's "Banned" section, and
diffed the two sorted code lists: **exact match, 29/29**, not "some cards"
or an approximate count. The rendered "Banned (29)" heading count itself
also read 29 (visible in the raw HTML as `Banned (<!-- -->29<!-- -->)` —
React's text/expression-node comment markers, the same known
splitting-not-duplication pattern the plan's §7.3 flagged as already
observed elsewhere in this app, not a real bug).

## §5 (Option A) — `/cards` format filter

- `src/lib/search/cards.ts`:
  - `CardSearchParams.format?: string` added.
  - `parseCardSearchParams()` parses/trims/blanks-to-undefined `format`
    exactly like `pack` (mirrors its handling 1:1).
  - `searchCards()`: added the exact condition the plan specified —
    ```ts
    conditions.push(
      Prisma.sql`(raw->'attributes'->'format_ids') @> to_jsonb(${params.format}::text)`,
    );
    ```
- `src/app/cards/page.tsx`: added a 6th parallel `Promise.all` fetch
  (`prisma.format.findMany({ orderBy: { name: "asc" } })`) and a new
  `<select name="format">`, labeled directly by `Format.name` (no
  `formatCode()`, since format names are already human-readable), positioned
  alongside the existing Faction/Side/Type/Keyword/Pack selects.
- `src/lib/search/cards.test.ts`: added a `describe("format filter", ...)`
  block with 4 real-DB cases: (1) `searchCards({ format: "system_gateway" })`
  matches a direct JSONB-containment count, asserted to equal exactly **77**
  (the plan's own §2b measurement, hard-asserted, not just "greater than
  0"); (2) every returned code actually has `system_gateway` in
  `format_ids`; (3) combines with `faction: "anarch"` (AND semantics),
  cross-checked against a direct combined-condition count; (4) a spot-check
  of `eternal`/`standard`/`snapshot` membership counts against the plan's
  2017/2016/1181 figures, via one grouped query against all three formats
  at once.

### Verification (§7.5 — real curl + direct psql cross-checks)

```
$ psql -c "SELECT count(*) FROM \"Card\" WHERE raw->'attributes'->'format_ids' @> '\"system_gateway\"'::jsonb;"
77

$ curl "http://localhost:3000/cards?format=system_gateway" | grep -o '>77<'
>77<
```
Exact match — 77, not approximate.

```
$ psql -c "SELECT count(*) FROM \"Card\" WHERE raw->'attributes'->'format_ids' @> '\"eternal\"'::jsonb AND \"factionCode\" = 'anarch';"
252

$ curl "http://localhost:3000/cards?format=eternal&faction=anarch" | grep -o '>252<'
>252<
```
AND-semantics combined filter confirmed exact match.

```
$ grep -o '<select name="format".*?</select>' /cards (rendered HTML)
<option value="">All</option>
<option value="eternal">Eternal</option>
<option value="ram">Random Access Memories</option>
<option value="snapshot">Snapshot</option>
<option value="standard">Standard</option>
<option value="startup">Startup</option>
<option value="system_gateway">System Gateway</option>
```
All 6 real `Format.name` values present, labeled by name not raw id. The
`<select>` is inside the existing `method="get"` form, so selecting a value
and submitting reproduces the same `?format=...` query param a hand-typed
URL would use — no extra client-side plumbing needed (same mechanism the
existing pack/faction/etc. selects already use).

Option B (currently-legal-in-format filtering) was **not** built, per the
plan's own explicit recommendation to build Option A first and scope Option
B as separate follow-up work — this is a deliberate scope decision matching
the plan, not an omission.

## §7.0 — Standing project-wide standards

- `npx tsc --noEmit` — clean, no output, exit 0.
- `npx eslint .` — clean, no output, exit 0.
- `pnpm test` — **140/140 tests pass** (14 test files), including the
  updated `restrictions.test.ts` (13/13, all `summarizeLegality` cases
  passing against the new `LegalityLine[]` shape) and the new `cards.test.ts`
  format-filter block (4/4, individually re-run with `--reporter=verbose` to
  confirm all four ran, not just "the suite as a whole passed").
- Dev-mode boot: `pnpm dev` — `curl http://localhost:3000/` → `200`.
- **Separate production check** (not skipped): `pnpm build` succeeded
  (`✓ Compiled successfully`, TypeScript pass, static page generation all
  green; route table explicitly lists the new `/formats` and `/formats/[id]`
  routes as `ƒ` dynamic). `pnpm start` then re-ran, and the **entire §7.3/
  §7.4/§7.5 curl battery above was re-run against the production server**
  with identical results (15_minutes' 4 format links, homepage's 6 format
  links, the nav link on `/cards`, `/formats` → 200, `/formats/eternal` →
  200, `/formats/not_a_real_format` → 404, `/cards?format=system_gateway` →
  `77`) — dev-mode passing was not treated as sufficient on its own.
- No new auth-gated routes: confirmed with real unauthenticated requests —
  `/formats`, `/formats/eternal`, and `/cards?format=eternal` all return
  `200` with no session/cookie, as expected for public read-only browsing
  routes. Nothing accidentally added an auth requirement.

## Deviations from the plan, and why

- **Seed loop uses `updateMany`, not `upsert`.** The plan's §3 prose
  described the seed as "upserts `Format.description` by `id`" but its own
  surrounding reasoning ("the seed only ever *updates* an existing row's
  `description` field, it never creates or deletes a `Format` row") is only
  actually true with `updateMany`/`update`, not `upsert` — `upsert` requires
  a full `create` payload (`name`, `raw` are non-nullable columns this seed
  has no value for) and would either fail to compile against those required
  fields or need fake placeholder values for them, either of which
  contradicts the plan's own explicit intent. Used `updateMany` (a no-op
  instead of throwing if the row doesn't exist yet) to implement the plan's
  stated intent literally, rather than its more casual "upsert" wording.
- **`FormatLink` built as a new sibling component, not a `FacetLink`
  extension.** The plan explicitly left this as an open choice ("the plan
  discusses both options, use your judgment"). Reasoning above (§4a). No
  functional gap either way — this is purely an implementation-shape choice
  the plan deferred to the build pass.
- Everything else matches the plan's file list, query shapes, and expected
  numbers exactly — no other deviations.

## Left unresolved / follow-ups

- Option B (currently-legal-in-format `/cards` filtering) remains explicitly
  out of scope, per the plan's own recommendation — a real follow-up item,
  not something this pass silently dropped.
- No GIN index was added for the new `format` JSONB-containment filter,
  matching the plan's own performance conclusion (13ms unindexed at 2054
  rows, "no index needed... would only be worth revisiting if the `Card`
  table grows by roughly two more orders of magnitude").
- Two `pg_dump` backups now exist in `prisma/pg_dump/` (an earlier one from
  before this session's work plus the one taken at the start of this build);
  neither is committed (gitignored per that directory's own README) — worth
  pruning the older one by hand at some point, not urgent.
