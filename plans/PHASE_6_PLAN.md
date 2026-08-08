# jinteki — Phase 6 Build Plan: NRDB-Inspired Cards/Decklists Enhancements

## Context

`agent-reports/netrunnerdb-ux-research.md` researched NetrunnerDB's (NRDB) UI/UX —
advanced search, set/pack browsing, the card detail page, search syntax, and decklist
browsing — and produced a prioritized "Recommendations for jinteki" section (§7,
items 1–10). This phase is that section turned into a concrete build plan, the same
"research doc → plan doc → build agent" pattern already used for the Scryfall research
pass (`plans/PHASE_5_PLAN.md`). The NRDB research doc itself is **not modified** by this
plan — it's a source, read-only.

Since that research was written, one relevant thing has landed: `plans/SEARCH_MATCHING.md`
(committed `ae47fec`) changed how `q` free-text matching works across `cards.ts`/
`decklists.ts`/`rule-sections.ts` — from whole-string `pg_trgm` similarity (`%`) to
`word_similarity`/`<%` OR'd with a plain `ILIKE` substring safety net. This phase's scope
is unchanged (still exactly the NRDB report's 10 items), but item 6 in particular
(free-text operator syntax) is directly affected — see "Baseline change" below.

## Baseline change since the NRDB research was written

`SEARCH_MATCHING.md`'s fix means every `q` box in the app (cards/decklists/rules) now
matches a short query against a substring of a long field reliably (the "bioroid"/
"rush"/"trash" dilution cases that doc measured), not just whole-string similarity.
Two things carry forward into this phase's scope, both **already-known, accepted
gaps** from that doc — not new problems this phase needs to solve:

- **Ranking ceiling**: any literal substring match scores a flat `1.0` under
  `word_similarity`, so a topical mention and an incidental one-off mention of the same
  word rank identically unless a title-level match happens to also apply (via the
  `GREATEST(...)` tie-break). Relevant below because item 6 folds recognized operator
  values out of `q`, leaving a shorter residual string to match via this same mechanism.
- **Dropped-letter typos aren't caught** (`rsh` → "Rush" stays a miss) — no trigram-based
  technique fixes this; out of scope for anything in this phase too.

Per-item effect: **item 6 is materially strengthened** by this baseline (detailed in its
own section below) — before `SEARCH_MATCHING.md`, a short residual token left over after
stripping a recognized operator risked the exact dilution bug that doc fixed, which would
have undermined item 6's premise. **Items 1–5 and 7–10 are unaffected** — they're either
exact-equality/array-containment filters (pack, existing faction/side/type/keyword),
in-memory sorts over already-fetched data, or entirely new schema/sync work with no
free-text matching involved at all.

## Things to confirm/verify at build time (not hard-coded from memory)

- **Item 2**: whether `CardAttributes.card_set_ids` entries (already synced into
  `Card.raw`) are literally the same string values as `Pack.code` — both should trace back
  to NRDB's `card_sets` resource ids per `sync-cards.ts`/`sync-packs.ts`, but confirm
  against real rows (`psql`) before assuming the join key matches, same discipline as
  Phase 4's image-URL field investigation.
- **Item 4**: whether `Decklist.raw` actually contains a description/notes field and
  under what exact key — `DecklistAttributes`'s `[key: string]: unknown` index signature
  doesn't rule it out, but it isn't in the typed fields today and wasn't confirmed by a
  fetched real NRDB API response in the source research. Check a handful of real rows
  first; if it doesn't exist, skip this item rather than inventing a field.
- **Item 6**: whether a recognized operator token inside `q` (e.g. `f:anarch`) should
  **override** or be **ignored in favor of** an explicit dropdown value if both are
  present in the same request (e.g. `?q=f:anarch&faction=nbn`). This plan recommends
  "dropdown wins" as the simpler, less-surprising default (see that section) but confirm
  this feels right once both are actually wired up side by side.
- **Item 9**: the exact NRDB v3 API resource/endpoint for Most Wanted List / restriction
  data — the source research names a "Meta Information" category with `restrictions` and
  `snapshots` resources from the API docs index, but no response shape was fetched and
  verified against a live endpoint. Verify the real shape before writing the schema/sync,
  same as every prior sync phase's "don't hardcode field names from memory" rule
  (Phase 2's decklist pagination bug, Phase 3's rule-section granularity).
- **Item 10**: whether NRDB's API exposes any per-set position/collector-number field at
  all for the abstracted `cards` resource (not just per-printing resources, which jinteki
  doesn't sync individually) — the source research flagged this as unconfirmed. If no such
  field exists on the resource jinteki actually syncs, this item may not be buildable
  without also changing what's synced at a deeper level than a simple column addition —
  confirm before scoping any schema change.

## Scope

Organized in the same three tiers as the source research, each item tagged with its
`netrunnerdb-ux-research.md` §7 reference.

### Quick wins (small, self-contained, no schema change)

1. **Pack filter on `/cards`** (§7 item 1)
2. **"Also printed in" list on `/cards/[code]`** (§7 item 2)
3. **Decklist author + creation date on `/decklists/[id]`** (§7 item 3)
4. **Decklist description/notes field, if it exists** (§7 item 4)
5. **Two more `/cards` view modes: Checklist and Names-only** (§7 item 5)

### Fits a near-term phase (small-to-medium, no new infrastructure)

6. **Minimal `field:value` operator syntax inside the `q` box** (§7 item 6)
7. **Sort control on `/decklists/[id]`'s card list** (§7 item 7, folding in item 8's
   naming-consistency principle directly)

### Bigger lift / future phase (real new work; don't block anything on these)

9. **Sync + surface NRDB's Most Wanted List / format-restriction data** (§7 item 9)
10. **Per-pack card ordering / prev-next navigation on `/cards/[code]`** (§7 item 10)

---

## 1. Pack filter on `/cards`

- `src/lib/search/cards.ts`: add `pack?: string` to `CardSearchParams`, parse it in
  `parseCardSearchParams()` (trim, blank → `undefined` — identical shape to
  `faction`/`side`/`type`). In `searchCards()`, add
  `conditions.push(Prisma.sql`"packCode" = ${params.pack}`)` — the exact same
  equality-filter pattern already used four times in that file (faction/side/type/
  keyword), so no new pattern is introduced.
- `src/app/cards/page.tsx`: a `<select name="pack">` alongside the existing Faction/Side/
  Type/Keyword selects, options from `prisma.pack.findMany({ orderBy: { name: "asc" } })`
  (parallel `Promise.all` entry alongside the existing `factions`/`typeRows`/`keywordRows`
  queries) — labeled by `Pack.name` (not `formatCode`, since pack names are already
  human-readable, e.g. "Core Set", unlike faction/type/keyword's lowercase-underscore
  codes).
- Test: extend `cards.test.ts` with a real-DB case — `searchCards({ pack: "core" })`
  returns exactly the cards with that `packCode` (cross-checked against
  `prisma.card.count({ where: { packCode: "core" } })`, same verification style Phase 5
  used for `keyword`/`order`).

## 2. "Also printed in" list on `/cards/[code]`

- `src/app/cards/[code]/page.tsx`: read `attributes.card_set_ids` (already available via
  the existing `attributes` extraction at the top of the component — no new query needed
  for the raw data itself). Resolve those ids against `Pack` with one extra query:
  `prisma.pack.findMany({ where: { code: { in: card_set_ids } } })`.
- Render as a small "Also printed in:" line listing pack names (comma-separated or a
  short inline list), each linking to `/cards?pack={code}` (reusing item 1's new filter —
  built in the same phase specifically so this link target exists). If `card_set_ids`
  has only one entry (the card's own current `packCode`), skip rendering the line
  entirely — it's only useful information when there's more than one printing.
- Explicitly **not** building Scryfall-style per-printing image/illustrator browsing —
  this is the deliberately lighter, text-only version the source research called out
  NRDB itself uses (§4/§8 of that report); no schema change, no new sync.
- No natural sort order is available (`Pack` has no release-date column — only
  `code`/`name` per `prisma/schema.prisma`); list in whatever order the `IN (...)` query
  returns, or sort by `Pack.name` alphabetically for determinism. Not worth adding a
  `Pack.dateRelease` column for this alone.

## 3. Decklist author + creation date on `/decklists/[id]`

- `src/app/decklists/[id]/page.tsx`: extract `raw.attributes.user_id` and
  `raw.attributes.created_at` the same way `/cards/[code]/page.tsx` already extracts
  `attributes` from `card.raw` (identical cast-and-read pattern, no new abstraction
  needed for two fields).
- Render as inert text, e.g. "Submitted `{created_at formatted as YYYY-MM-DD}` (NRDB
  user `{user_id}`)" — **not** a link to anything inside jinteki (`user_id` is an NRDB
  user id, not a jinteki `User`; there's no synced NRDB-user table to join against).
  Optionally link out to the equivalent real NRDB decklist page
  (`https://netrunnerdb.com/en/decklist/{decklist.id}`, since `Decklist.id` is synced
  verbatim as NRDB's own UUID per `src/sync/sync-decklists.ts`) for anyone who wants to
  see the original page/comments/author profile — a deliberate, narrow exception to the
  "don't link out" stance the source research took for the ANCUR rules-wiki case,
  because this is linking to the *canonical source record itself*, not a substitute for
  something jinteki should build in-house.
- Format the date with a fixed, locale-independent format (e.g.
  `new Date(created_at).toISOString().slice(0, 10)`) rather than `toLocaleDateString()`,
  since this renders server-side and should be deterministic regardless of server locale.

## 4. Decklist description/notes field

- **Spike first, build only if confirmed**: `docker compose exec postgres psql -U jinteki
  -d jinteki -c "SELECT raw->'attributes'->>'description' FROM \"Decklist\" WHERE
  raw->'attributes'->>'description' IS NOT NULL LIMIT 5;"` (adjust the key name and try a
  couple of candidates — `description`, `notes` — against real rows first).
- If a real field is found: add it to `DecklistAttributes` in `src/lib/nrdb/types.ts` with
  its real key name (currently relies only on the `[key: string]: unknown` index
  signature), then render it on `/decklists/[id]` as a plain paragraph. Check whether it
  contains the same kind of embedded formatting tags card text does (`renderCardText()`
  precedent, `src/lib/card-text.tsx`) — if so, reuse that renderer rather than writing a
  second one; if the tag vocabulary differs, note the difference rather than assuming
  it's identical.
- If no such field exists in the real synced data: **skip this item entirely** — do not
  add a field or UI based on the source research's inference alone, since the research
  doc itself flagged this as unconfirmed.

## 5. Checklist and Names-only view modes on `/cards`

- `src/app/cards/page.tsx`: extend `type View = "list" | "grid"` to
  `"list" | "grid" | "checklist" | "names"`, and `parseView()`'s validation accordingly.
  Deliberately **not** chasing NRDB's full six modes — "Full Cards"/"Rulings only" don't
  map cleanly onto jinteki's current data/UI, and "Text only" is materially the same as
  the existing `list` view. Two new modes, not six.
- **Checklist**: denser than the current `list` view — one row per card, tighter vertical
  rhythm (e.g. `py-0.5` instead of `py-2`), title + a compact one-line stat summary
  (faction/type abbreviated, no separate spans). Good for scanning a whole pack once
  item 1's pack filter exists.
- **Names only**: just linked titles in a wrapped flex/grid layout, no metadata at all —
  maximum density, closest analog to NRDB's "Names only" mode.
- Both are pure rendering branches over the same already-fetched `items` array (identical
  principle to the existing `list`/`grid` toggle — "no new query," per
  `PHASE_5_PLAN.md`). Add both as additional links next to the existing List/Grid toggle
  (same `hrefWithOverrides("/cards", rawParams, { view: "..." })` pattern, no new
  abstraction).

## 6. Minimal `field:value` operator syntax inside `q`

The one item materially changed by `SEARCH_MATCHING.md`: the residual free text left
after stripping recognized operators now goes through `word_similarity`/`ILIKE` matching
instead of the old whole-string `%` similarity, so a short leftover term (e.g. "virus"
after stripping `f:anarch`) won't silently get diluted the way `SEARCH_MATCHING.md`'s
"bioroid" case would have under the old implementation. This lowers the risk of building
this item now versus when the research was originally written.

- Scope: **cards only** for this phase. NRDB's `f`/`t`/`s`/`d` operands map onto
  `Card.factionCode`/`typeCode`/`keywords`/`sideCode` — columns `/cards` already filters
  on via dropdowns. Decklists/rule-sections have no equivalent structured facets today
  (rule-sections explicitly doesn't, per `PHASE_5_PLAN.md`; decklists only has
  `identity`), so there's nothing for an operator prefix to map onto there yet — not
  attempted this phase.
- Implementation: a small pre-parse step inside `parseCardSearchParams()`
  (`src/lib/search/cards.ts`), so `searchCards()` itself is unchanged and every caller
  benefits automatically. Scan the raw `q` string, tokenized on whitespace, for tokens
  matching `^(f|t|s|d):(\S+)$` (case-insensitive prefix letter). For each recognized
  token, fold its value into the corresponding field (`f`→`faction`, `t`→`type`,
  `s`→`keyword`, `d`→`side`); strip the token out of `q`; whatever text remains
  (trimmed, possibly empty) becomes the final `q` passed to `searchCards()`.
  Unrecognized prefixes (anything not exactly `f`/`t`/`s`/`d` before the colon, e.g.
  `x:foo`) are left alone as literal text, not stripped — same "don't invent behavior for
  the unrecognized case" caution used in `src/lib/card-text.tsx`'s tag parser.
- **Precedence rule** (per "Things to confirm" above): if the request also has an
  explicit `faction`/`type`/`keyword`/`side` param set (from the dropdown form
  submission) *and* a matching operator token in `q`, the explicit dropdown param wins —
  the operator-derived value is only used to fill in a field the dropdown left blank.
  Rationale: the dropdown is the primary, discoverable UI for most users; the operator
  syntax is a power-user shortcut layered on top, not a competing source of truth.
- No UI change needed beyond the parsing itself: `/cards/page.tsx` already reads
  `params.faction`/`params.type`/etc. for the dropdowns' `defaultValue`, so a
  `q=f:anarch virus` URL will already show "Anarch" selected in the Faction dropdown
  once `parseCardSearchParams()` extracts it — no special-casing needed in the page
  component. The visible `q` input box shows exactly what's in the URL (unparsed,
  e.g. still literally `f:anarch virus`), not a rewritten/stripped version — parsing is
  idempotent (re-parsing the same string on every request yields the same
  faction+residual split), so this is safe to leave as-is.
- Tests (`cards.test.ts`): pure parsing tests (no DB) for `parseCardSearchParams` —
  each of the four prefixes recognized individually, case-insensitivity
  (`F:anarch` == `f:anarch`), multiple operators plus residual text
  (`"f:anarch s:virus rootkit"` → `faction: "anarch", keyword: "virus", q: "rootkit"`),
  an unrecognized prefix left as literal text, and the dropdown-wins precedence rule
  (explicit `faction` param takes priority over an `f:` token in `q`). One real-DB
  integration test in `searchCards()`'s existing test block: `q: "f:anarch s:virus"`
  (no residual text at all) returns exactly the cards matching both filters, cross-checked
  against a direct `prisma.card.findMany` with the equivalent `where` clause.

## 7. Sort control on `/decklists/[id]`'s card list (folds in item 8's naming principle)

- The source research's item 8 is a naming-consistency principle, not separate scope —
  applied directly here: name the new control `order`, matching `/cards`' existing
  `order` param exactly (not `sort` or any page-specific name), so the pattern stays
  "one param name/shape across every page that has a sort control," per the source
  research's explicit callout.
- `src/app/decklists/[id]/page.tsx`: read an `order` value from `searchParams` (this page
  currently takes no `searchParams` at all — add the prop, same
  `Promise<SearchParamsInput>` shape used elsewhere). Replace the current hardcoded
  `.sort((a, b) => { type then title })` with a small lookup keyed by `order`'s value
  (`"type"` [current default], `"faction"`, `"name"`), falling back to the existing
  type-then-title behavior when `order` is absent/unrecognized — additive, not breaking.
  This sorts the already-fetched `decklist.cards` array in memory; no new query, since
  the full card list for one decklist is already loaded.
- UI: plain links (not a `<select>`/form), mirroring `/cards`' existing List/Grid toggle
  precedent rather than introducing a form for a single control — e.g. "Sort:
  Type | Faction | Name" links using the same `hrefWithOverrides`-style helper (either
  import a shared version if one gets extracted, or a small local copy — not worth a
  shared abstraction for two use sites yet).
- Test: none strictly required (this is a pure in-memory array sort with no DB query
  behind it, similar in kind to `resolveRuleSectionIds` — could add a small pure unit
  test for the comparator function if it's extracted to its own named function rather
  than an inline arrow, which is also better for testability generally).

## 9. Sync + surface Most Wanted List / format-restriction data

The one finding in the source research that isn't a Scryfall-style non-goal — a real,
current Netrunner mechanic (Banned/Restricted/Points-per-format) with **zero**
representation in `prisma/schema.prisma` today.

- **Verify the real API shape first** (see "Things to confirm" above) — do not write
  the schema below from memory beyond a first draft; treat it as a starting sketch to
  validate against a real fetched response, same discipline as every prior sync phase.
- Draft schema addition (subject to the above verification):
  ```prisma
  model Restriction {
    id          String   @id // NRDB restriction/snapshot id
    name        String
    dateStart   DateTime?
    active      Boolean  @default(false)
    raw         Json

    entries CardRestrictionEntry[]
  }

  model CardRestrictionEntry {
    id            Int      @id @default(autoincrement())
    restrictionId String
    cardCode      String
    status        String   // "banned" | "restricted" | "points"
    points        Int?     // only meaningful when status = "points"

    restriction Restriction @relation(fields: [restrictionId], references: [id])
    card        Card        @relation(fields: [cardCode], references: [code])

    @@unique([restrictionId, cardCode])
  }
  ```
- New sync script `src/sync/sync-restrictions.ts`, following the exact established
  pattern from Phase 2 (writes a `SyncRun` row, upserts with delete-cleanup per
  `509eedb`'s seed-script precedent), wired into `/admin/sync` as a new sync type
  alongside factions/packs/cards/decklists/rulings.
- UI: a "Legal in: Standard, Startup — Banned in: Eternal" (or similar, shape depends on
  what the real data looks like) line on `/cards/[code]`, querying
  `CardRestrictionEntry` rows for that card joined to `Restriction`, filtered to
  `active: true` snapshots only (don't show historical/superseded restrictions by
  default — could be a future "show restriction history" expansion, not this phase).
  A `restriction`/format filter on `/cards` is an optional stretch within this item; the
  core ask (surface current status on the detail page) doesn't require it.
- Verification: schema change confirmed via direct `psql`/`\d` introspection (not just a
  successful `prisma migrate` exit code); sync correctness confirmed via real row counts
  cross-checked against the live NRDB API response, not self-reported; the new admin
  sync trigger checked with a real authenticated request using the established real-
  session-cookie technique.

### Follow-on (unnumbered): format descriptions, links, and `/cards` filter

Item 9's optional stretch (a `restriction`/format filter on `/cards`) and its deferred
restriction history were later designed and built as a separate, unnumbered follow-on —
not part of this phase's scope — in
`agent-reports/format-descriptions-links-and-search-plan.md` (design) /
`-build.md` (build report). Summary, full detail lives in that plan:

- **`Format.description`**: hand-curated seed data (`prisma/format-description-data.ts`
  via `prisma/seed.ts`), not scraped from NSG's site and not a DB-editable admin table —
  NRDB's `/formats` API has no description field to sync.
- **Card-detail legality links**: `summarizeLegality()` (`src/lib/restrictions.ts`)
  changed from `string[]` to structured `LegalityLine[]` (carrying `formatId`), rendered
  on `/cards/[code]` as real links via a new `FormatLink` component.
- **Homepage + nav**: a "Formats" section on `/`, plus a persistent nav link.
- **New pages**: `/formats` (list) and `/formats/[id]` (description + restriction
  history + the stretch goal below).
- **Stretch goal, built**: "currently banned/restricted/pointed in this format" on
  `/formats/[id]`, via new `src/lib/search/format-cards.ts`.
- **`/cards` format filter**: membership-only (Option A — `format_ids` JSONB
  containment); "currently legal in format X" (Option B) deferred further as its own
  follow-up.

## 10. Per-pack card ordering / prev-next navigation

- **Verify the field exists at all first** (see "Things to confirm" above) — this item
  may not be buildable as scoped if NRDB's abstracted `cards` resource has no per-set
  position field (only individual `printings` resources might, which jinteki doesn't
  sync per-printing, by deliberate Phase 2/4 schema decision). If confirmed impossible
  without a deeper sync-model change, downgrade this item to "not currently buildable,
  revisit only if jinteki ever adds per-printing sync" rather than forcing it.
- If a usable field exists: add `Card.packPosition Int?` (nullable — not every card needs
  one, e.g. promos), synced by `sync-cards.ts`, migration + `psql` introspection to
  confirm.
- UI: prev/next links on `/cards/[code]`, scoped to cards sharing the same `packCode`,
  ordered by `packPosition` (query: cards in the same pack, find the current card's
  neighbors by position — a small dedicated query, not reusing `searchCards()`, since
  this isn't a filtered list view).
- Lowest priority of the three bigger-lift items — touches the primary `Card` sync that
  2054 existing rows already depend on, more invasive than item 9's wholly new table.

---

## Testing

Per-item test additions are specified inline above. Summary: pure-parsing tests for
item 6's operator syntax (no DB, fixture-style, matching `resolveRuleSectionIds.test.ts`'s
precedent), real-DB tests extending `cards.test.ts` for items 1 and 6's integration case,
a spike-then-maybe-build test for item 4, and standard sync-correctness tests for item 9
if it proceeds (real row counts, same pattern as every prior sync phase).

## Verification

Follow `PROJECT_PLAN.md`'s "Phase verification standards" in full: typecheck/lint,
dev-mode boot+curl, a **separate** production `build`+`start`+curl check, schema changes
(items 9/10, if built) verified by direct introspection, data-writing logic (item 9's
sync) verified by real row counts, tests passing. Phase-specific additions:

- **Item 6's operator syntax verified against real data**, not just unit tests in
  isolation — a real `curl localhost:3000/cards?q=f:anarch+s:virus` request, extracting
  the rendered card codes and diffing against a direct `psql`/Prisma equivalent query,
  same discipline `SEARCH_MATCHING.md` and Phase 5's keyword/order verification used.
- **Item 2/3's data is read correctly from `Card.raw`/`Decklist.raw`**, spot-checked
  against a couple of real cards/decklists known (via direct `psql`) to have multiple
  printings / a real `user_id`, not just cards where the new UI happens to render nothing
  because the underlying data is absent for that particular row.
- **Items 9/10, if built**: the sync's real row counts cross-checked against the live
  NRDB API response for the same resource (not just "the sync completed without an
  error"), matching the standard this project has applied to every previous sync phase
  since Phase 2's decklist-pagination bug was caught exactly this way.

## Explicitly deferred to later work (not built now)

- Extending item 6's operator syntax to `/decklists` or `/rules` — no structured facets
  exist on those pages to map operators onto yet; revisit only if that changes.
- NRDB's other four "View as" modes (Full Cards, Text only, Rulings only) beyond the two
  added in item 5 — not clearly distinct enough from what already exists to be worth it.
- ~~Restriction-based filtering on `/cards` (item 9's optional stretch) and restriction
  history (showing superseded snapshots, not just the active one).~~ Built via the
  unnumbered follow-on above.
- Any deployment/hosting work — still out of scope per `PROJECT_PLAN.md`, unchanged from
  Phase 5's closing note.
