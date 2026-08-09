# jinteki — Phase 8 Build Plan: Decklist Advanced Search & Quick Views

## Context

`agent-reports/decklist-search-quickviews-research.md` is this phase's source of truth — a
research pass commissioned specifically to answer whether jinteki can faithfully reproduce NRDB's
decklist advanced search form and its Popular/Recent/Tournaments/Hot-Topics/Decklist-of-the-Week/
Hall-of-Fame tabs. It was vetted before this plan was written: its two load-bearing claims (the
real API decklist resource's exact attribute set, and the real API docs' decklists endpoint list)
were independently re-fetched by the orchestrating session and matched exactly. The report's
central finding is decisive and is the whole shape of this plan: **the public NRDB v3 API decklist
resource has zero engagement/popularity/tournament fields, and its own docs confirm no such
resource exists for decklists at all.** This isn't "not yet found" — three independent fetches
came back with the identical thirteen-field attribute set every time, and a fourth confirmed the
docs index lists only one list endpoint plus four filters (faction, cards-contains,
cards-excludes, identity) for the entire decklists category.

### Divergence from the literal request, and why

The task that produced this plan asked for support for "all the same quick options for decklists
('popular', 'recent', etc.)." Per `AGENTS.md`'s research → vet → build workflow and
`RESEARCH_AND_VERIFICATION_PRINCIPLES.md` (this project's standing discipline against faking data
it doesn't have — see e.g. `agent-reports/netrunnerdb-ux-research.md` §8's parallel refusal to
build a fake "Popular" ranking, now independently re-confirmed by direct API evidence rather than
assumption), **this plan does not build Popular, Hall of Fame, Hot Topics, or Tournaments, and
builds only the non-curatorial *shape* of Decklist of the Week.** These four-and-a-half tabs all
depend on real-user engagement or tournament-placement data that lives only in NRDB's private
application database and is not reachable through any documented or observed part of the public
API jinteki syncs from — building them would mean either scraping NRDB's own site (fragile,
likely against its ToS, and still not "jinteki's data") or fabricating numbers with nothing behind
them. Instead, this plan builds what the research confirmed *is* real and honestly labelable: a
**Recent** tab (unchanged meaning, `created_at`), a **Recently updated** tab (`updated_at`, a
genuinely different signal from Recent, free to add alongside it), a **Favorited by jinteki
users** tab (real engagement data — just jinteki's own, at jinteki's own scale, labeled distinctly
so it never claims to be NRDB's Popular), and a **Posted this week** filter (the honest,
non-curatorial version of Decklist of the Week's date-window shape, explicitly not claiming any
curation). This is a deliberate, evidence-based scope decision, not an oversight — flag it to the
repo owner in the task report the same way every prior phase has flagged its own deliberate
divergences.

### What jinteki has today, being replaced

`src/app/decklists/page.tsx` currently renders a hybrid: a `q` (name) text box plus an `identity`
`<select>`, backed by `src/lib/search/decklists.ts`'s `searchDecklists()`/
`parseDecklistSearchParams()` (word-similarity + ILIKE on `Decklist.name`, equality on
`identityCode`). Per the task's explicit instruction, **this simple search is removed for now** —
not trimmed, removed, the same way `PHASE_7_PLAN.md` fully deleted `/cards`' seven facet
`<select>`s rather than leaving them half-working. `/decklists` becomes the quick-views landing
page; structured filtering moves entirely to the new `/decklists/advanced`, mirroring the card
side's `/cards` → `/cards/advanced` split (`plans/ADVANCED_CARD_SEARCH_PLAN.md`,
`plans/PHASE_7_PLAN.md`) as closely as the two domains' actual data allows.

## Baseline read directly against the live database before writing this plan

- `SELECT count(*) FROM "Decklist"` → **74242** (grown from Phase 2's 74233 via incremental syncs
  — expect this number to have moved again by build time; re-read it, don't hardcode 74242 into
  any check).
- `SELECT count(*) FROM "DecklistFavorite"` → **0**. The Favorited-by-jinteki-users tab will be
  genuinely empty at launch — its empty state is not a hypothetical edge case, it is the default,
  everyday state until real users favorite real decklists. Build and verify the empty state as a
  first-class case, not an afterthought.
- `Decklist` currently has exactly two indexes: the primary key and `Decklist_name_trgm_idx` (GIN,
  trigram). No index exists on anything date-related — expected, since no date column exists yet.
- Faction-via-identity join sanity check: `anarch`-identity decklists = **12201** (re-verify this
  exact number at build/verify time as a cross-check for the new Faction facet).

## Scope

1. **Schema migration**: promote `created_at`, `updated_at`, and the NRDB author id from
   `Decklist.raw` into real, indexed `Decklist` columns, with a one-time backfill and an updated
   sync mapping so future syncs keep them current.
2. **`/decklists`** rebuilt as the quick-views landing page: Recent (default) / Recently updated /
   Posted this week / Favorited by jinteki users tabs, each a plain link changing a `tab` param —
   no text search box, no filter form.
3. **`src/lib/search/decklists-advanced.ts`** (new) — the structured-search query engine.
4. **`/decklists/advanced`** — the form. Renders no results, mirrors `/cards/advanced`'s layout
   conventions directly (same `Row` pattern, same page chrome) since there is no separate mockup
   for this phase.
5. **`/decklists/advanced/results`** — results, controls, pagination.
6. **Link repoints**: home page's "Browse Decklists" → `/decklists/advanced` (mirroring "Browse
   Cards" → `/cards/advanced`); `/decklists` (the new quick-views page) gains a "Search" link to
   `/decklists/advanced`, matching NRDB's own tab bar's "Search" entry; the site header's
   "Decklists" link stays on `/decklists`, now pointing at the quick-views landing rather than the
   old hybrid form.
7. **Deletion**: `parseDecklistSearchParams()`/`searchDecklists()` and their tests, fully removed
   — not deprecated, not left unused (this is the retired simple-search engine; nothing after this
   phase should reference it, per the removal instruction above and `PHASE_7_PLAN.md`'s precedent
   of deleting rather than stubbing retired UI).
8. **Testing**: Vitest coverage for the new parser, the new query engine (real DB), and the tab
   queries, matching `cards-advanced.test.ts`'s shape.

---

## 1. Schema migration

`prisma/schema.prisma`'s `Decklist` model gains three nullable columns:

```prisma
model Decklist {
  id           String    @id
  name         String
  identityCode String
  createdAt    DateTime?
  updatedAt    DateTime?
  nrdbUserId   String?   // confirm exact JSON type (string vs. number) against a real fetched
                          // resource before choosing Int? vs String? here — do not assume
  raw          Json

  identity Card           @relation(fields: [identityCode], references: [code])
  cards    DecklistCard[]

  favoritedBy DecklistFavorite[]

  @@index([name(ops: raw("gin_trgm_ops"))], type: Gin, map: "Decklist_name_trgm_idx")
  @@index([createdAt])
  @@index([updatedAt])
}
```

Nullable, not backfill-blocking-required: mirrors `Format.description`'s existing precedent
(`prisma/schema.prisma` line ~300) for a column a future sync run populates rather than one that
must be non-null from row one.

- **Migration**: `pnpm prisma migrate dev`, then a one-time backfill —
  `UPDATE "Decklist" SET "createdAt" = (raw->'attributes'->>'created_at')::timestamptz,
  "updatedAt" = (raw->'attributes'->>'updated_at')::timestamptz,
  "nrdbUserId" = raw->'attributes'->>'user_id'` (adjust the last line's cast once the real JSON
  type is confirmed) — run once against the live 74k+ rows, not per-request.
- **`src/sync/sync-decklists.ts`'s `mapDecklist()`** gains three added field mappings so every
  future sync (incremental or full) keeps these columns current going forward, not just the
  one-time backfill — the same class of gap `agent-reports/decklist-search-quickviews-research.md`
  §5/Recommendation (c)(2) calls out explicitly.
- **Standing hazard, unconditional per `RESEARCH_AND_VERIFICATION_PRINCIPLES.md`**: this project's
  Postgres GIN indexes are invisible to Prisma's own schema representation, and an auto-generated
  migration has silently dropped them before. After this migration, directly confirm via
  `\di` / `pg_indexes` that `Decklist_name_trgm_idx` still exists — this is not optional.

---

## 2. `/decklists` — quick-views landing page

Replaces the current hybrid form+list page entirely. No `<form>`, no text input, no `<select>` —
a row of tab links (mirroring `ResultsControls`' `ControlLink` pattern from
`src/components/results-controls.tsx`) plus a results list plus pagination. Tabs, in this order:

| Tab | `?tab=` value | Query | Notes |
|---|---|---|---|
| Recent | `recent` (default — also what a bare `/decklists` with no `tab` param renders) | `ORDER BY "createdAt" DESC NULLS LAST, id ASC` | Same meaning as NRDB's own Recent, per the research's §4 item 1. The `NULLS LAST`/tie-break on `id` matters for rows synced before this phase's backfill ran correctly and for stable pagination — verify no `NULL` `createdAt` rows actually remain post-backfill instead of assuming the tie-break is dead code. |
| Recently updated | `updated` | `ORDER BY "updatedAt" DESC NULLS LAST, id ASC` | Distinct signal from Recent — a deck actively being revised surfaces here even if posted years ago (research §4 item 2). |
| Posted this week | `week` | `WHERE "createdAt" >= now() - interval '7 days'` then the Recent ordering | **Label exactly "Posted this week," never "Decklist of the week"** — the curation claim is what's being deliberately dropped, only the date-window shape survives (research §4 item 4). |
| Favorited by jinteki users | `favorited` | `SELECT d.*, count(f.*) AS favorite_count FROM "Decklist" d JOIN "DecklistFavorite" f ON f."decklistId" = d.id GROUP BY d.id ORDER BY favorite_count DESC, d."createdAt" DESC` | Inner join naturally excludes zero-favorite decks — no explicit minimum-count filter needed, the join *is* the filter. **Must render a real empty state** ("No decklists have been favorited by jinteki users yet." or similar — not a bare empty list with no explanation) since this is the default state today (0 rows, confirmed above), not a rare edge case. |

Each row shown the same way the current page shows them (name linked, identity linked) plus,
per-tab, whatever field that tab is sorted by (Recent/Posted-this-week show the post date;
Recently-updated shows the updated date; Favorited shows the favorite count) — so the sort key is
never invisible the way `PHASE_5_PLAN.md`'s empty-state principle already established for rulings.
A **Search** link (to `/decklists/advanced`) sits alongside the tabs, matching NRDB's own tab bar
having "Search" as a peer entry, not a separate concept.

Query implementation: a new function per tab (or one function taking a `tab` enum) in
`src/lib/search/decklists.ts` (the old `searchDecklists`/`parseDecklistSearchParams` are deleted
from this file, not left beside the new code) — plain `Prisma.sql` per tab, `PagedResult<T>`
return shape matching every other search function in this codebase. Pagination via the existing
`PaginationNav` component, `basePath="/decklists"`, preserving `tab` in `hrefWithOverrides`-style
query construction (reuse `hrefWithOverrides` from `src/components/card-results.tsx` if it's
generic enough, or the equivalent pattern — it already takes an arbitrary `SearchParamsInput`, not
anything card-specific).

---

## 3. `src/lib/search/decklists-advanced.ts` (new)

A separate engine from the tab queries above, same reasoning `cards-advanced.ts` gives for being
separate from `searchCards()` — genuinely different semantics (multi-criterion AND vs. a fixed
per-tab sort), kept apart so neither can regress the other.

```ts
export interface AdvancedDecklistSearchParams {
  name?: string;
  fuzzy?: boolean;
  identity?: string;
  faction?: string[];
  side?: string;
  pack?: string[];
  cardsUsed?: string[];
  cardsExcluded?: string[];
  authorId?: string;
  order?: string;       // "name" | "date" — nothing engagement-based, ever
  page?: number | string;
  pageSize?: number | string;
}
```

- **`name`**: plain `ILIKE` against `Decklist.name` by default; a `fuzzy` checkbox ORs in `<%`
  word-similarity, exactly mirroring `cards-advanced.ts`'s `textCondition()` — reuse that function
  directly (`import { textCondition, likePattern } from "./cards"` — it's already generic over the
  column, no decklist-specific fork needed) rather than duplicating it. This is an addition beyond
  NRDB's own decklist form (which has no fuzzy toggle documented) for consistency with jinteki's
  own established advanced-search pattern — note this as a deliberate, useful divergence in the
  task report, not silently.
- **`identity`**: `d."identityCode" = ${identity}` — reuses the same "identities actually used by
  at least one decklist" query the current page already runs
  (`prisma.card.findMany({ where: { decklistsAsIdentity: { some: {} } } ... })`), moved into this
  page's data-fetching.
- **`faction`/`side`**: via the existing `c` (identity) join — `c."factionCode" = ANY(${faction})`
  (multi, OR-within-facet, matching `buildFacetConditions()`'s existing pattern) / `c."sideCode" =
  ${side}` (single).
- **`pack`**: "deck contains at least one card from any of the selected packs" —
  `EXISTS (SELECT 1 FROM "DecklistCard" dc JOIN "Card" cc ON cc.code = dc."cardCode" WHERE
  dc."decklistId" = d.id AND cc."packCode" = ANY(${pack}))`. **Flag explicitly**: the real NRDB
  form's exact `packs[]` semantics (restrict-the-pool vs. contains-a-card-from) could not be
  confirmed from the evidence gathered (research §1) — this is a deliberate, reasonable
  interpretation for a *browsing* feature ("which decks use cards from these sets"), not a
  confirmed match to NRDB's own behavior. State this plainly in the task report rather than
  implying it was verified.
- **`cardsUsed`**: per the API docs' own literal endpoint name ("containing **all** supplied Card
  ids" — `agent-reports/decklist-search-quickviews-research.md` §3, directly confirmed), AND
  semantics — one `EXISTS (SELECT 1 FROM "DecklistCard" dc WHERE dc."decklistId" = d.id AND
  dc."cardCode" = ${code})` condition per selected card, ANDed together (simple, and each lookup
  hits `DecklistCard`'s existing `@@id([decklistId, cardCode])` composite primary key directly —
  no new index needed).
- **`cardsExcluded`**: mirror image, "excluding **all** supplied Card ids" — one `NOT EXISTS (...)`
  condition per selected card, ANDed.
- **`authorId`**: `d."nrdbUserId" = ${authorId}` once the migration above lands. **Low practical
  utility, included anyway for honesty and field-parity with NRDB's own form** — it's a raw NRDB
  numeric/string user id, not a searchable username (jinteki has no synced NRDB-user directory to
  resolve one to the other); say this plainly on the form itself (hint text), not just in the plan.
- **Ordering**: `order=name` → `ORDER BY name ASC`; `order=date` → `ORDER BY "createdAt" DESC NULLS
  LAST, name ASC`; no `order` and no `name` filter → `name ASC`; no `order` with `fuzzy` name search
  on → same relevance-ranking fallback `cards-advanced.ts` uses (`word_similarity` DESC). **No
  Popularity/Likes/Reputation option exists anywhere in this parser or form** — not offered, not a
  no-op, genuinely absent, per the divergence section above.

`parseAdvancedDecklistSearchParams()` follows `parseAdvancedCardSearchParams()`'s exact shape
(`allParams()` for repeatable facets, `firstParam()` for singles, same `PAGE_SIZE_OPTIONS`/
`DEFAULT_PAGE_SIZE` reuse from `src/lib/search/pagination.ts`).

---

## 4. `/decklists/advanced` — the form

Same page chrome and `Row` layout convention as `src/app/cards/advanced/page.tsx` — reuse that
file as the structural template directly (there is no separate mockup this phase). Renders no
results. Header: `Advanced Decklist Search`, with **Quick views** (→ `/decklists`) and **Home**
links (the decklist-side equivalent of the card form's "Simple search"/"Home" pair — named
differently here since there is no simple decklist search left to link to).

Rows, in order: Decklist Name (text) · Matching (fuzzy checkbox, same hint pattern as the card
form's, adapted) · Identity (plain `<select>`, reusing the existing "identities in use" query) ·
Faction (facet picker) · Side (plain `<select>`, two options) · Pack (facet picker) · Cards used
(facet picker, options = full card list `{value: code, label: title}`, ~2054 options — confirm at
build time that `FacetPicker`'s client-side substring filtering stays responsive at this option
count; it already handles the ~2000-code keyword/pack lists on the card side with no reported
issue, but this is the first time the *full* card list feeds it rather than a smaller
faction/type/pack list, worth a real check not an assumption) · Cards excluded (same picker,
separate field) · Author (text, hint stating plainly it's a raw NRDB id, not a name) · *Sort by*
(select: Name / Date) · *Decklists per page* (select: 30/60/100, reusing `PAGE_SIZE_OPTIONS`).
Then **Search** / **Reset**, same as the card form.

---

## 5. `/decklists/advanced/results`

Header: `Search results`, **Edit search** / **Quick views** / **Home** links. Read-only summary of
active filters (same purpose as the card results page's summary — "without it the page can't
explain its own count"). Controls row: result count, then Sort (Name/Date) + Per page — no
"Display" group, since decklists have never had multiple view modes (list/grid is a card-image
concept that doesn't apply here; don't invent one). A small `decklist-results-controls.tsx` is
only worth extracting if it ends up genuinely shared by two pages the way `results-controls.tsx`
is — check whether `/decklists`' tabs page also wants a Per-page control before deciding to
extract vs. inline; don't force the extraction if it turns out to be one page's concern.

---

## 6. Link repoints

Exactly two files, per a `grep '"/decklists"' src` before starting (re-run it — this plan's own
earlier grep found three hits; confirm the same three still hold at build time rather than trusting
this list blindly):

- `src/app/page.tsx` — "Browse Decklists" button → `/decklists/advanced` (mirroring "Browse Cards"
  → `/cards/advanced` exactly, including adding the equivalent one-line caption under the button
  row if the existing "Browse Cards opens the advanced search form." caption's layout allows a
  natural second line, or extending that caption to cover both buttons — build-time layout call).
- `src/components/site-header.tsx` — "Decklists" nav link **stays pointed at `/decklists`** (no
  change needed here — it already targets the right route, which now happens to render something
  different). Confirm this explicitly rather than assuming; don't repoint something that doesn't
  need it.
- `src/app/decklists/page.tsx`'s own internal `PaginationNav basePath` — unaffected, still
  `/decklists`, now carrying `tab` instead of `q`/`identity`.

---

## Explicitly deferred (named, not silently dropped)

- **Popular / Hall of Fame / Hot Topics / Tournaments / Decklist of the Week's curation half** —
  see the Divergence section above. Not a gap to close later without new information; would need
  NRDB to expose data it currently does not.
- **True MWL/Tournament-Legal deck-wide legality filtering** (NRDB's Rotation / Tournament Legal /
  Most Wanted List fields, in their full sense: no banned card present, the sum of "points" cards
  under the active `Restriction.point_limit` budget, `universal_faction_cost`/influence handling,
  `global_penalty` rules). Confirmed, post-launch, to still be a materially bigger, genuinely new
  computation than anything else in this phase — real game-rules aggregation across a whole deck,
  not a simple per-card equality/containment filter, and building it wrong would silently mislead
  rather than just underdeliver. `src/lib/restrictions.ts`'s `computeCardLegality()` already does
  the *per-card* version (used on `/cards/[code]`) but nothing aggregates that deck-wide today.
  Left for a dedicated future session, per explicit instruction (2026-08-08) — do not build this
  without a fresh design pass on the points-budget/global-penalty rules. **Card-pool-membership**
  Format filtering (a much lighter, different question — "is every card in this deck a member of
  Format X's pool at all," the same semantics `/cards/advanced`'s own Format filter already uses)
  was *not* part of this gap — see the Addendum below, added the same day after the repo owner
  asked why Format was missing from `/decklists/advanced`.
- **`Decklist.raw`'s `notes` field** — confirmed real and unused by this research
  (`decklist-search-quickviews-research.md` §3), but showing it on `/decklists/[id]` is a detail
  page enhancement, not part of this phase's search/quick-views scope. Worth a quick follow-up,
  not bundled here.
- **"My decklists" / "My favorites" tabs** — explicitly out of scope per the task.
- Anything deployment/hosting-related — unchanged, still out of scope per `PROJECT_PLAN.md`.

---

## Testing

- `decklists.test.ts` (rewritten, not patched): the old `searchDecklists`/
  `parseDecklistSearchParams` tests are removed along with the code they tested. New tests per tab
  query: Recent/Recently-updated ordering correctness against known `createdAt`/`updatedAt` values;
  Posted-this-week's date-window boundary; Favorited-by-jinteki-users against a fixture with a
  couple of `DecklistFavorite` rows inserted directly (real DB, matching this project's existing
  no-mocking convention) plus an explicit empty-state test (0 favorites → 0 rows, not an error).
- `decklists-advanced.test.ts` (new), mirroring `cards-advanced.test.ts`'s shape: parsing tests
  (no DB); real-DB tests for fuzzy on/off on `name`, faction/side via the identity join, pack
  membership, cards-used AND semantics (a two-card combination returns the intersection, cross-
  checked against `prisma.decklistCard.count`-based manual verification), cards-excluded NOT
  semantics, author-id equality once populated.

## Verification

Full `PROJECT_PLAN.md` "Phase verification standards": typecheck/lint, `pnpm test`, dev boot+curl,
a **separate** production `build`+`start`+curl, tests passing. Phase-specific, with concrete
expected values computed before the build (re-verify these against the *current* row counts at
verification time, since the dataset grows via ongoing syncs — don't treat 74242 as frozen):

- **Migration didn't drop anything**: `Decklist_name_trgm_idx` still present in `pg_indexes` after
  the migration (the standing GIN-index hazard, checked directly, not assumed).
- **Backfill correctness**: `SELECT count(*) FROM "Decklist" WHERE "createdAt" IS NULL` → **0**
  after the backfill (every row has `created_at` in its `raw`, so none should be left null);
  spot-check 3 real rows' `createdAt` column value against `raw->'attributes'->>'created_at'`
  directly.
- **Recent tab** genuinely sorts newest-first: fetch page 1, confirm each row's `createdAt` is
  `>=` the next row's, via a direct `psql` query on the same tab's `ORDER BY`, not by trusting the
  rendered page.
- **Favorited-by-jinteki-users empty state**: with 0 rows in `DecklistFavorite` (today's real
  state), the tab renders its explanatory empty-state text, not a bare empty list — then insert
  one real `DecklistFavorite` row (via the existing, already-shipped toggle Server Action with a
  real session cookie, the established technique since Phase 1) and confirm the tab now shows
  exactly that one decklist, then remove it again to leave the database as found.
- **Cards-used AND semantics, real numbers**: pick two real cards known to co-occur in some decks
  but not all (derive the actual pair and expected count live via `psql`, don't invent one) and
  confirm `/decklists/advanced/results?cards=X&cards=Y` matches a direct `psql` count of decks
  containing both.
- **Faction facet cross-check**: `?faction=anarch` → re-run the baseline's `12201` query live and
  confirm the page's count matches exactly (expect it to have grown slightly since this plan was
  written — confirm against a fresh query, not the number printed above).
- **No `$queryRawUnsafe`, no string-concatenated SQL** anywhere in the new files — grep, per every
  prior phase's hard security requirement.
- **Old simple search is genuinely gone**: `searchDecklists`/`parseDecklistSearchParams` do not
  exist anywhere in `src/` after this phase (grep for the symbol names), and `/decklists`' rendered
  HTML contains no `name="q"` text input or `name="identity"` select.
- **Sort options never include anything engagement-based**: grep the rendered `/decklists/advanced`
  HTML and the `order`/sort option arrays in source for "popular"/"likes"/"reputation" — none
  should appear anywhere, confirming the divergence in this plan was actually built as specified,
  not partially.

---

## Addendum (2026-08-08): Format (card-pool membership) filter

Added after Phase 8 shipped, in response to the repo owner asking why `/decklists/advanced` has no
Format filter at all. Answer, worked out live: "Format" was hiding two different questions, only
one of which is cheap. This addendum builds the cheap one; the "Explicitly deferred" section above
was rewritten the same day to describe the other, harder one precisely, and it is **not** built by
this addendum.

**What this adds**: "is every card in this deck a member of Format X's current card pool" —
**not** legality (a card can be pool-member and still banned/pointed under the active
`Restriction`; this filter says nothing about that, same honest limitation
`/cards/advanced`'s own Format row already states in its hint: "Cards in that format's card pool,
not just those currently legal in it"). Reuses that exact same `format_ids` JSONB-containment
check (`src/lib/search/cards.ts`, the `format` facet condition) against every card in the deck,
the same per-card `EXISTS`/`NOT EXISTS`-over-`DecklistCard` shape this phase already used three
times (pack, cards-used, cards-excluded) — genuinely the same pattern a fourth time, not new
infrastructure.

### Query engine (`src/lib/search/decklists-advanced.ts`)

- `AdvancedDecklistSearchParams` gains `format?: string`.
- One condition, deck-wide "no card fails membership":
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
  Deliberately includes the identity too (`DecklistCard` rows cover every card slot including the
  identity, per Phase 4's own finding that NRDB's `card_slots` includes it) — a deck whose identity
  isn't in the format's pool isn't a member of that format, matching how a real player would judge
  it.
- `parseAdvancedDecklistSearchParams()`: `format: firstParam(input, "format")?.trim() || undefined`
  — single-valued, matching `/cards/advanced`'s own Format field (not a multi-picker; "any format"
  is the unset default, same as everywhere else this pattern is used).

### Form (`src/app/decklists/advanced/page.tsx`)

One new `Row`, placed directly after Side (mirroring `/cards/advanced`'s own row order — Format
sits after Side there too): a plain `<select>` populated by the same `prisma.format.findMany()`
call the page already runs for nothing else yet, labeled "Format," with the **identical hint
text** `/cards/advanced` uses: "Cards in that format's card pool, not just those currently legal
in it." — reusing the exact wording is deliberate, not laziness: it is the same honest caveat,
about the same underlying data, and inventing different wording for an identical limitation would
only risk the two pages disagreeing over time.

### Results page

Add `format` to the read-only active-filter summary line, same as every other facet there.

### Testing

`decklists-advanced.test.ts` gains: a real-DB test that `?format=standard` returns a strict subset
of the unfiltered total, cross-checked against a direct `psql` query using the identical
`NOT EXISTS`/JSONB-containment shape (independently written, not copy-pasted from the
implementation, matching this phase's existing testing discipline); a test that a decklist whose
*identity* alone fails membership is correctly excluded (not just non-identity cards); and a
parsing test that a blank/absent `format` param filters nothing.

### Verification

Same standards as the rest of this phase (typecheck/lint/tests, dev boot+curl, separate production
build+start+curl). Phase-specific: compute the real `?format=standard` count via a fresh `psql`
query at build/verify time (do not reuse any number written in this addendum, none is given here
on purpose) and confirm the live HTTP response matches exactly; confirm the hint text is verbatim
identical to `/cards/advanced`'s own Format row hint (a literal string diff, not "looks similar").
