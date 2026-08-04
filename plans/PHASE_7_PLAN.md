# jinteki — Phase 7 Build Plan: Split Card Search (Simple + Advanced)

## Context

Two design docs specify this phase and are its source of truth:

- `plans/ADVANCED_CARD_SEARCH_PLAN.md` — the structured form, its results page, the syntax reference.
- `plans/SIMPLE_CARD_SEARCH_PLAN.md` — the simplified `/cards`, the home page search box, link repoints.

Both were revised against annotated visual mockups covering every screen in this phase (the form,
the facet picker's four states, both results pages, the home page, and the stale-filter-link case).
**The mockups are the layout contract** — where this plan and a mockup disagree, the mockup wins,
and any deliberate divergence must be stated in the task report with its reason.

Nothing here changes the schema, syncs data, or adds an auth-gated route. One new client component
is introduced (see item 3), which is the only architecturally novel thing in the phase.

**Addendum, built in a follow-up cycle after the eleven items below shipped**: a second client
component and a scope change to the prefix syntax. See "Addendum" at the end of this doc — the
"one new client component" line above describes only the original eleven items.

## Baseline

`plans/SEARCH_MATCHING.md` settled how `q` matches (`word_similarity`/`<%` OR'd with `ILIKE`).
`PHASE_6_PLAN.md` item 6 added `f:`/`t:`/`s:`/`d:` prefix folding via `extractOperators()`. Both are
reused as-is. Two already-documented, accepted gaps carry forward untouched: the flat-`1.0` ranking
ceiling for literal substring matches, and dropped-letter typos (`rsh` → "Rush") staying a miss.

## Scope

### Foundations (do first — everything else depends on these)

1. **Shared search helpers** — `src/lib/search/types.ts`, `src/lib/search/cards.ts`
2. **Shared UI extractions** — `card-results.tsx`, `results-controls.tsx`
3. **The facet picker** — `src/components/facet-picker.tsx` (client component)

### Advanced search

4. **`src/lib/search/cards-advanced.ts`** — the new engine
5. **`/cards/advanced`** — the form
6. **`/cards/advanced/results`** — results
7. **`/cards/syntax`** — the reference page

### Simple search

8. **`/cards`** — simplified
9. **`/` home page** — search box + Browse Cards repoint
10. **Link repoints** — `facet-link.tsx`, `/cards/[code]`

### Incidental fix

11. **`formatCode("ap")`**

---

## 1. Shared search helpers

**`src/lib/search/types.ts`** — add beside the existing `firstParam()`:

```ts
export function allParams(input: SearchParamsInput, key: string): string[] {
  const value = input[key];
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map((v) => v.trim()).filter(Boolean);
}
```

`SearchParamsInput` already types repeated keys as `string[]` — no type change needed.

**`src/lib/search/cards.ts`** —

- `export` the existing `extractOperators` and `ORDER_COLUMNS` (currently module-private).
- Extract the six facet conditions into a shared, array-accepting helper:

```ts
export function buildFacetConditions(params: {
  faction?: string | string[]; side?: string; type?: string | string[];
  keyword?: string | string[]; pack?: string | string[]; format?: string;
}): Prisma.Sql[]
```

  - `faction` / `type` / `pack`: `"factionCode" = ANY(${values})` etc. for the multi-value case;
    keep plain `=` for a single value so existing query plans are unchanged.
  - `keyword`: single stays `${v} = ANY("keywords")`; multiple becomes overlap,
    `"keywords" && ${values}` — equality does not generalise to a set.
  - `side` / `format`: unchanged equality and JSONB containment.
  - Every value stays inside `Prisma.sql` parameterisation. Never `$queryRawUnsafe`, per that
    file's header rule.
- `searchCards()` calls the helper instead of building conditions inline. **Its behaviour must not
  change** — the existing `cards.test.ts` passing untouched is the proof.

## 2. Shared UI extractions

Pure refactors, verbatim moves, no behaviour change.

**`src/components/card-results.tsx`** — `CardResultsList({ items, view })` carrying the four
existing view branches (`names` / `checklist` / `list` / `grid`) exactly as they are in
`/cards/page.tsx` today, plus the view-toggle links and the `hrefWithOverrides()` helper and
`parseView()`. `/cards/page.tsx` imports these instead of defining them.

**`src/components/results-controls.tsx`** — the Display / Sort / Per page cluster, so `/cards` and
`/cards/advanced/results` are identical by construction rather than by discipline. Props: current
`view`, `order`, `pageSize`, the base path, and the raw search params (for `hrefWithOverrides`).
Sort options: Relevance *(default, empty value)* / Title / Faction / Type. Page sizes: 30 / 60 / 100
(`DEFAULT_PAGE_SIZE` is 30, `MAX_PAGE_SIZE` is 100 — do not offer values above the clamp).

## 3. The facet picker

`src/components/facet-picker.tsx`, `"use client"`. The one architecturally novel piece: the app has
carried a "no client component, no local state — URL searchParams are the entire source of truth"
note since Phase 4. This is a deliberate, contained exception, and the containment is the point.

- **Props**: `name` (the query param), `label`, `options: { value: string; label: string }[]`,
  `selected: string[]`, `placeholder`. Options come from the server component that already queries
  them; the picker performs **no data access of its own**.
- **Output**: one `<input type="hidden" name={name} value={v}>` per selected value, inside the
  surrounding plain `<form method="get">`. The URL stays the source of truth; the picker only helps
  compose it. No fetching, no routing, no state outliving submit.
- **Progressive enhancement**: render a plain `<select multiple name={name}>` until mounted, then
  swap to the chip UI —
  `const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), []);`
  With JS off the form still works, plainly. Chosen over a `<noscript>` block because hidden inputs
  inside a CSS-hidden container still submit and would double up with the fallback's values.
- **Interaction**, per the mockup's four states: click opens; typing filters the list and
  **highlights the matched substring** inside each option label; selecting adds a chip and keeps the
  box open for another; each chip removes via its own `×`; already-selected options show a tick in
  the list and stay in place rather than disappearing.
- **Keyboard support is required**: ↑/↓ move the highlight, Enter selects, Backspace on an empty
  input removes the last chip, Escape closes. Focus must remain visible throughout.
- Used for **Type, Faction, Subtype, Pack**. Not for Side (two options) or Format (six) — those stay
  plain `<select>`s.

## 4. `src/lib/search/cards-advanced.ts`

A **separate engine**, not a branch inside `searchCards()` — the semantics differ (AND-of-two-columns
vs. OR-of-one-merged-query; opt-in vs. always-on fuzziness), and separation keeps the shipped simple
path at zero regression risk.

- `AdvancedCardSearchParams` — `title`, `text`, `fuzzy: boolean`, `faction/type/keyword/pack:
  string[]`, `side`, `format`, `order`, `page`, `pageSize`.
- `parseAdvancedCardSearchParams(input)` — reads multi-value facets via `allParams()`, single ones
  via `firstParam()`, `fuzzy` as `=== "1"`. Runs `title` then `text` through `extractOperators()`,
  folding prefix tokens into facets that are still empty. **Precedence, unchanged from Phase 6: an
  explicit picker value always beats a token.** When both boxes carry a token for the same field,
  `title`'s wins — arbitrary but deterministic, and documented on `/cards/syntax`.
- `searchCardsAdvanced(params)` — `buildFacetConditions()` plus, per text field:
  - fuzzy off: `title ILIKE ${like}`
  - fuzzy on: `(title ILIKE ${like} OR ${term} <% title)`
  All conditions ANDed. Ordering: explicit `order` wins; else if fuzzy and a text field is set, rank
  by `GREATEST(word_similarity(...), word_similarity(...))`; else `title ASC`.
- Same `SELECT` / count / `LIMIT` / `OFFSET` shape and `PagedResult<CardSummary>` return as
  `searchCards()`.

## 5. `/cards/advanced` — the form

Renders **no results at all**. One criterion per row: label in a fixed left column (~132px), field
plus hint on the right, hairline rule between rows. Order, matching the mockup exactly:

Card Name · Card Text · Matching (fuzzy checkbox) · Type · Faction · Subtype · Pack · Side · Format ·
*Preferences* · Sort by · Cards per page. Then **Search** and a **Reset** link.

- Header: `Advanced Card Search`, with **Simple search** and **Home** links.
- Card Name hint names the prefix syntax and links to `/cards/syntax`. Card Text hint states that
  filling both boxes requires a card to match both.
- The fuzzy hint must name simple search as the always-forgiving option — this is the agreed
  mitigation for the asymmetry below, not optional polish.
- Picker option data fetched in the existing `Promise.all` style: factions, distinct types, distinct
  keywords, packs, formats.

## 6. `/cards/advanced/results`

- Header: `Search results`, with **Edit search** (back to the form with every value restored from
  the URL) and **Home**.
- A **read-only summary** of the active query — "Type Event, Program · Faction Anarch, Criminal ·
  Subtype Virus". Required: without it the page cannot explain its own count, since the filters live
  elsewhere.
- One controls row: count left; `ResultsControls` right. **No filter widgets.**
- `CardResultsList` then `PaginationNav`.

## 7. `/cards/syntax`

Static, no DB query, no `searchParams`. Sections: Title and Text · Fuzzy matching (opt-in) ·
Prefixes table · Precedence · Not supported.

Document **only what is implemented**. The "Not supported" list — negation, `|`, quoted phrases,
regex, and any prefix beyond the four — is required, not optional: it stops anyone arriving from
Scryfall or NRDB wondering whether they missed something. **Verify every worked example against the
database at build time** rather than copying the codes out of this plan.

## 8. `/cards` — simplified

- Form reduced to one `q` input plus a submit button. **Delete** the seven `<select>`s *and* the four
  queries that populated them (`prisma.faction.findMany`, the keyword `groupBy`,
  `prisma.pack.findMany`, `prisma.format.findMany`) — they move to `/cards/advanced`, they are not
  left running here.
- Hint under the box: "Searches card names and rules text together." plus a `/cards/syntax` link.
- **`parseCardSearchParams()` is not modified** — inbound links keep filtering.
- **Read-only "filtered by" note** when any non-`q` facet param is present, with **Clear filter**
  (keeps `q` and `view`, drops facets) and **Edit in advanced search** (hands the params to the page
  that can change them).
- Keep `ResultsControls`, `CardResultsList`, `PaginationNav`. Header gains an **Advanced search**
  link.

## 9. `/` home page

- A `<form method="get" action="/cards">` with one `q` input and a submit button, directly under the
  tagline and above the button row, styled as a single rounded-full control matching the page's
  existing button vocabulary, ~470px, centred.
- Hint line: `Try bioroid, or f:anarch virus · Search syntax help` → `/cards/syntax`.
- **Browse Cards** repoints to `/cards/advanced`, with a one-line caption under the button row
  saying so. Browse Decklists and Browse Rules unchanged.
- Heading, tagline and Formats list unchanged.

## 10. Link repoints

Exactly two sites, confirmed by grepping `/cards?` across `src/`:

- `src/components/facet-link.tsx` → `/cards/advanced?{param}={value}`
- `src/app/cards/[code]/page.tsx` "Also printed in" pack links → `/cards/advanced?pack={code}`

**Do not** repoint `format-link.tsx` (already targets `/formats/{id}`, a detail page),
`site-header.tsx`'s Cards link (deliberately stays on `/cards`), or any `/cards/{code}` detail link.

## 11. `formatCode("ap")`

`CODE_LABEL_OVERRIDES` in `src/lib/format.ts` has an entry for `nbn` → "NBN" but not for `ap`, which
renders as "Ap". AP is a real ice subtype on 76 cards and is about to appear in the Subtype picker's
option list. Add the override. While there, check the other 103 keyword codes and 11 type codes for
further abbreviation-like cases **against the real data** rather than assuming `ap` is the only one.

---

## The asymmetry (do not "fix" it in code)

`/cards` always matches with `word_similarity` **and** `ILIKE`. `/cards/advanced` uses `ILIKE` only
unless fuzzy is ticked. **Advanced can return fewer results than simple for the same input.** This is
intended and specified by both design docs — casual search forgiving, precise search literal. The
mitigation is copy (the fuzzy hint naming simple search), not a behaviour change. A build agent that
"fixes" this by defaulting fuzzy on has broken the phase's hard requirement.

## Testing

- **`cards.test.ts` — unchanged assertions must pass**, proving the `buildFacetConditions()` /
  `extractOperators()` extraction altered nothing.
- **`cards-advanced.test.ts` (new)**:
  - Parsing, no DB: each prefix recognised in `title` alone, `text` alone, and both for different
    fields; case-insensitivity; explicit facet beating a same-field token in either box; `fuzzy=1`
    vs. absent; repeated params collected into arrays.
  - Real DB, the opt-out default actually holding: `title: "efficency"` with fuzzy off returns **0**;
    with fuzzy on returns **3** (Bioroid Efficiency Research, Efficiency Committee, Peak Efficiency).
  - Real DB, AND not OR: `title` + `text` together returns the intersection of the two single-field
    result sets, cross-checked against two separate queries.
  - Real DB, multi-value: `type=[event,program]` equals the union of each alone; combined with
    `faction=[anarch,criminal]` + `keyword=[virus]` returns **34**, cross-checked against a direct
    `prisma.card.count`.
  - Real DB, keyword overlap: a card carrying either of two requested keywords matches.
- **`allParams()`** — unit tests for absent, single, repeated, and blank-value inputs.
- **`facet-picker`** — render test that the pre-mount fallback is a real `<select multiple>` with the
  right options and selections.
- **The "filtered by" note** — renders with a facet param, renders nothing without one, and its
  Clear filter href preserves `q` and `view` while dropping facets.

## Verification

Full `PROJECT_PLAN.md` "Phase verification standards": typecheck, lint, `pnpm test`, dev boot + curl,
and a **separate** production `build` + `start` + curl (neither substitutes for the other). No schema
change, no data writing, no new auth-gated route — those three checks are not applicable and should
be stated as such rather than silently skipped. Phase-specific:

- **Counts cross-checked against `psql`, not asserted from code**: `?title=efficency` → 0 vs.
  `&fuzzy=1` → 3; `?faction=anarch&faction=criminal&type=event&type=program&keyword=virus` → 34;
  `/cards?q=bioroid` → 23 (unchanged from before the phase); `/cards?faction=anarch` → 253.
- **Precedence, live**: `?title=f:anarch+virus` folds the token; `?title=f:anarch&faction=nbn` lets
  the explicit value win.
- **The form renders no results** — assert the *absence* of result rows on `/cards/advanced`.
- **No-JS path** — the server-rendered `/cards/advanced` HTML contains real `<select multiple>`
  elements with full option lists, since that is what a client without JS receives.
- **`/cards` is genuinely stripped** — rendered HTML contains no `name="faction"` / `name="pack"` /
  `name="format"` selects, and the four option-populating queries are gone from the page source.
- **Repoints complete** — fetch `sure_gamble` and `sifr` (known-good real examples per
  `agent-reports/phase-6.md`), grep for any surviving `href="/cards?faction=` / `?type=` /
  `?keyword=` / `?pack=`. A missed one silently lands on the simplified page.
- **Extraction is behaviour-preserving** — `/cards?q=bioroid&view=list` renders the same card codes
  in the same order before and after the `CardResultsList` move.
- **Syntax page examples are real** — each worked example checked against the database.
- **Style matches the mockups** — the annotated mockups cover every screen here. Divergences are
  allowed where there is a reason; each must be named in the task report with that reason.

## Explicitly deferred

- Quoting, negation, OR, regex, and NRDB's other prefixes — named as non-goals on `/cards/syntax`.
- ~~Client-side autocomplete on either simple search box; both stay plain GET forms.~~ **Reversed
  in the Addendum below.**
- Extending advanced search or the "filtered by" note to `/decklists` or `/rules`.
- Saved searches, search history, sharing beyond the plain URL.
- Any deployment/hosting work — still out of scope per `PROJECT_PLAN.md`.

---

## Addendum: prefix type-ahead + Advanced Search text-field simplification

Built after the eleven items above, in a second build→verify→fix→verify cycle, in response to a
real usability gap the prefix syntax had: values must be the exact underlying code
(`f:haas_bioroid`, not "Haas-Bioroid" or "haas bioroid"), case-sensitive, no partial match, no
spaces, no quoting — first documented as prose on `/cards/syntax` (a separate task before this
addendum), then actually fixed here rather than left as something to memorise. **This explicitly
reverses this plan's own "Explicitly deferred" item** ruling out client-side autocomplete on the
simple search boxes — worth stating plainly since a reader who only sees that line would otherwise
trust it as still current.

### 12. Type-ahead for the prefix syntax

`src/components/simple-search-box.tsx` (new, `"use client"`) — a client component for the one
freeform `q` box (home page, `/cards`, and item 14's new field), distinct from `facet-picker.tsx`'s
discrete multi-value chip UI: this box holds one arbitrary string that may contain zero or more
`prefix:value` tokens mixed with ordinary words, not an array of chosen values.

- **Trigger**: on `onChange`/`onSelect`, scan backward/forward from the caret to the nearest
  whitespace to find the current token. If it matches `/^(f|t|s|d):(\S*)$/i` (looser than
  `OPERATOR_TOKEN` — a bare `f:` with nothing after the colon still opens the dropdown), open it;
  otherwise close it.
- **Filtering**: match the prefix's option list (`src/lib/search/prefix-options.ts`, new -
  `getPrefixOptions()`, sharing the faction/type/keyword queries `/cards/advanced` already ran,
  plus a static two-item side list) by label or code containing the typed text, case-insensitive.
  Up to 8 shown, highlighted the same way `facet-picker.tsx`'s `HighlightedLabel` does — that
  function and `useHasMounted` were promoted from module-private to exported so both components
  share them rather than duplicate them.
- **Accepting a suggestion — splice by offset, not split/join**: only the text after the colon is
  replaced with the option's code plus a trailing space; the prefix letter and its case are left
  exactly as typed (`F:ana` → `F:anarch `, not rewritten to lowercase); everything before and after
  the token is untouched. Completing a token that isn't at the end of the string can leave a double
  space where the replacement meets existing text — confirmed harmless: `q.split(/\s+/)` in
  `extractOperators()`/`parseCardSearchParams()` already collapses runs of whitespace.
- **No-JS fallback is trivial here**, unlike the facet picker: pre-mount, this is just an ordinary
  `<input type="text" name="q">` — that already is what a non-JS user needs, since the box was
  always plain text. No separate fallback markup, no hydration-mismatch handling beyond the same
  `useHasMounted()` pattern `facet-picker.tsx` already used.
- Keyboard: same shape as `facet-picker.tsx` — arrows move the highlight (wrapping), Enter accepts
  and `preventDefault`s so it doesn't submit the form while the dropdown is open, Escape closes,
  click-outside closes. The keyboard handler only intercepts Enter while a token with at least one
  match is open, so Enter submits normally the rest of the time.
- **Known, accepted limitation**: clicking back into an already-completed token reopens the
  dropdown with the existing value as the sole match, so the next Enter re-completes to the same
  string instead of submitting — one keypress swallowed, no data loss, no wrong result. Left as-is
  rather than adding complexity to distinguish "reopened on an unchanged value" from a genuine edit.
- Not in scope: suggesting the four prefix letters themselves (only triggers once a full `letter:`
  is typed), fuzzy/typo-tolerant matching of option values, pixel-precise caret positioning.

### 13. Prefix syntax removed from Advanced Search's Card Name / Card Text fields

`src/lib/search/cards-advanced.ts`: `parseAdvancedCardSearchParams()` no longer runs `title`/`text`
through `extractOperators()`. Both become pure literal strings — whatever was typed, unmodified.
This removes the whole "which box's token wins" precedence question the original item 4 specified,
since there's nothing left to arbitrate: the facet params (`faction`/`type`/`keyword`/`side`) on
that page come **only** from the pickers now, never from parsing the text fields. Deliberate
simplification, not a bug fix for anything wrong with the folding logic itself — the pickers
already covered these exact four facets, which made a second, code-memorising way to set them
redundant and, per the usability gap above, actively confusing.

`/cards/advanced/page.tsx`'s Card Name hint drops the "prefixes work here too" sentence and its
`/cards/syntax` link — reduced to "Matches the card's title only." The link now lives on item 14's
field instead, since that's where the syntax applies.

`extractOperators()` itself is untouched and still exported from `cards.ts` — `/cards`'
`parseCardSearchParams()` uses it exactly as item 1 originally specified. This change is scoped to
the advanced parser only.

### 14. A "Simple search" field at the top of `/cards/advanced`

Labeled exactly **"Simple search"**, above Card Name, its own `<form method="get" action="/cards">`
(separate from the criteria form below it, which still posts to `/cards/advanced/results`)
containing a `SimpleSearchBox` and a submit button — not a new query path, the same
`parseCardSearchParams()`/`searchCards()` engine `/cards` itself uses. Visually set apart with a
border/divider from the criteria rows.

This does not violate item 5's "renders no results" requirement — that requirement is about the
criteria form; this new field is a second, separate form that navigates away to `/cards` on submit,
same destination as the page header's existing "Simple search" link, just with a working box
attached now instead of only a link.

`getPrefixOptions()` is called by all three pages that render a `SimpleSearchBox` (home, `/cards`,
`/cards/advanced`) rather than each re-deriving its own faction/type/keyword/side lists —
`/cards/advanced/page.tsx`'s three inline queries (faction `findMany`, type `groupBy`, keyword
`unnest`) were replaced by this call; its Pack/Format queries, which have no prefix letter, stay
local. Home and `/cards` previously fetched none of these — each gained one small `Promise.all` leg.

### 15. `/cards/syntax` updated for the new scope

Prefixes now work in **simple search only** — the home page's box, `/cards`, and item 14's field —
and no longer apply to Advanced Search's Card Name/Card Text, which are pure literal matches with
no prefix parsing. The "Card Name's wins" precedence bullet from the original item 7 is gone, since
there's no longer a second field to arbitrate against; the precedence section instead keeps the
still-true rule that a filter already in the URL beats a prefix token
(`/cards?faction=nbn&q=f:anarch` → 241, every NBN card — re-verified). The type-ahead is mentioned
as the reason the earlier value-format guidance (exact code, case-sensitive, no spaces, no quoting)
matters less in practice now, though it's kept — a user can still type a value by hand and hit the
same footguns if they ignore the suggestions.

### Fix applied after verification: the "filtered by" note and the box could disagree with each other

Found during the surgical verify pass on this addendum, not part of the original build: `/cards`'
read-only "filtered by" note (item 8) was built from `params.*` — the *parsed*, post-token-fold
values — so a facet derived from typing e.g. `f:anarch` into the box was reported in the banner
("Filtered by Faction: Anarch — set from the link you followed, and not editable here") while the
box itself showed only the token-stripped residual (`virus`) and no hidden input carried the
derived facet forward. Pressing Search again silently dropped the filter (`q=f:anarch+virus` → 47
cards; resubmit → `q=virus` → 78). This gap predates this addendum (item 8's original design), but
this addendum's whole point is to get people typing prefix tokens into that exact box, converting a
rare edge case into the mainline path — so it was fixed here rather than left for later.

Fix, in `src/app/cards/page.tsx`:
- The `q` box's `defaultValue` now shows the **raw**, unparsed `q` (`firstParam(rawParams, "q")`)
  instead of `params.q` (the residual). The token stays visible exactly where it was typed, and
  resubmitting is now idempotent — the same text re-parses to the same facet + residual every time,
  with no hidden-input bookkeeping needed for it.
- The "filtered by" note now reads `describeFacets(rawParams)` instead of reconstructing from
  `params.*` — so it only ever describes a facet that is genuinely present as a URL param (a
  bookmarked or followed link, the case it was built for), never one derived from a `q` token
  (which is now visible in the box itself, per the point above, and doesn't need a separate note).

Both behaviors were re-verified end to end after the fix, in dev and a separate production build:
`/cards?q=f:anarch+virus` renders the box as `value="f:anarch virus"`, no banner, 47 results;
resubmitting still returns 47 (not 78). `/cards?faction=anarch` (a genuine URL-param case) is
unaffected — banner still present, hidden `faction` input still carried, 253 results.

### Testing added

- `src/lib/search/cards-advanced.test.ts`: the operator-folding-in-title/text tests from the
  original item 4 spec are removed (they tested behavior item 13 deliberately deleted); a new test
  pins the replacement behavior — `parseAdvancedCardSearchParams({ title: "f:anarch" })` yields a
  literal `title: "f:anarch"` with `faction` left empty.
- `src/components/simple-search-box.test.ts` (new): pre-mount/no-JS render tests (a real
  `<input type="text" name="q">` with the right `defaultValue`, matching `facet-picker.test.ts`'s
  precedent), plus unit tests on the extracted pure `findPrefixToken`/`spliceCompletion` logic
  directly — the one part of this component that doesn't require a browser to verify, since this
  repo has no jsdom/testing-library. The hydrated dropdown/keyboard behavior remains an accepted,
  documented gap, same as `facet-picker.tsx`'s chip UI.
- Suite: 228 → 241 tests.

### Verification added

Same standards as the rest of this plan — typecheck/lint/tests, dev + separate production
build/start + curl, `psql` cross-checks. Specific to this addendum:

- `/cards/advanced/results?title=f:anarch` → 0 (literal, not folded — `title ILIKE '%f:anarch%'` =
  0 in psql, vs. `factionCode='anarch'` = 253); `/cards/advanced/results?text=s:virus` → 0
  (literal), vs. `?keyword=virus` → 41.
- `/cards/advanced` renders exactly two disjoint `<form>`s, `action="/cards"` and
  `action="/cards/advanced/results"`, with zero param leakage between them, and the criteria form's
  "no results" invariant still holds.
- Every `SimpleSearchBox` site pre-mount-renders a bare `<input type="text" name="q">`.
- The double-space artifact traced through the real parsers (`extractOperators`,
  `parseCardSearchParams`) and confirmed inert.
- The "filtered by"/box-value fix re-verified end to end in both dev and production, as described
  above.
- Injection safety re-confirmed on the (unchanged) SQL paths these fields still go through: `?q=%`,
  `?title='; DROP TABLE "Card"; --'`, `?q=a%00b` all return 200 with `Card` still at 2054 rows.
