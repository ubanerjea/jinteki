# jinteki — Simple Card Search Design

## Context

Companion to `plans/ADVANCED_CARD_SEARCH_PLAN.md` — read that first. Once the structured filter form
moves to `/cards/advanced`, `/cards` simplifies down to its free-text box, and that same box becomes
the primary entry point on the home page. `agent-reports/scryfall-ux-research.md` §6 notes Scryfall's
homepage "is dominated by a single search box... search is clearly positioned as the primary entry
point to the whole site" — jinteki's homepage today is three nav buttons with no search at all.

**Revised against a visual mockup**, which is the current source of truth for layout.

**The search engine does not change.** `searchCards()`, `parseCardSearchParams()` and
`extractOperators()` in `src/lib/search/cards.ts` already are "a single text field using the existing
trigram word_similarity plus substring matching, still supporting the power-user syntax." This plan
is UI placement only — the sole library change is the shared `buildFacetConditions()` extraction that
the companion plan specifies, which `searchCards()` calls without behaving differently.

**Revised again after launch**: the companion plan's follow-up cycle removed prefix syntax
(`f:`/`t:`/`s:`/`d:`) from Advanced Search's Card Name/Card Text fields and consolidated it here,
in Simple Search, as the syntax's one home. To make that consolidation actually usable — values
must be an exact underlying code, case-sensitive, no spaces, no partial match — the box gained
type-ahead completion (`src/components/simple-search-box.tsx`). This **explicitly reverses** this
plan's own "Deliberately not built" item ruling out client-side autocomplete; see "Type-ahead
completion" below for what was actually built and why the original reasoning no longer holds.

## Sequencing

The link repoints below target `/cards/advanced`, which must exist first or land in the same change.

## Home page — `src/app/page.tsx`

1. **A search box directly under the tagline, above the three buttons.** A plain
   `<form method="get" action="/cards">` containing a `SimpleSearchBox` (see "Type-ahead
   completion" below) and a submit button, styled as a single rounded-full control to match the
   page's existing button vocabulary, capped around 470px and centred. Submitting lands on
   `/cards?q=…` — no new route, no new query path. `SimpleSearchBox` is a client component (added
   in the follow-up cycle, see below); the surrounding form is still a plain GET form, and the box
   degrades to an ordinary `<input>` with JavaScript off.
2. **A hint line under the box**: `Try bioroid, or f:anarch virus · Search syntax help`, linking to
   `/cards/syntax`. The prefix syntax is otherwise undiscoverable, and this is the highest-traffic
   place to reveal it.
3. **"Browse Cards" repoints to `/cards/advanced`.** Only that button. Browse Decklists and Browse
   Rules are untouched. A one-line caption under the button row states that Browse Cards opens the
   advanced search form — without it the change is invisible until clicked.
4. Everything else — heading, tagline, Formats list — is unchanged.

Search sits above the buttons because typing a name is the common case; the buttons are for when you
have nothing specific in mind.

## `/cards` — `src/app/cards/page.tsx`

- **Strip the form to one `q` input plus a submit button.** The Faction / Side / Type / Keyword /
  Pack / Format / Sort `<select>`s move to `/cards/advanced` — moved, not duplicated. The queries
  that populated them (`prisma.faction.findMany`, the keyword `groupBy`, `prisma.pack.findMany`,
  `prisma.format.findMany`) move with them and must be **deleted from this page**, not left running.
- **A hint line under the box**: "Searches card names and rules text together." plus a
  `/cards/syntax` link. This one sentence is what tells a user why this page behaves differently
  from the advanced form's two separate fields.
- **The box shows the raw, unparsed `q`** (`firstParam(rawParams, "q")`), not the post-token-fold
  residual. A search for `f:anarch virus` renders the box back as `f:anarch virus`, not just
  `virus` — the token stays visible exactly where it was typed, and resubmitting is idempotent (the
  same text re-parses to the same facet + residual every time). Corrected in the follow-up cycle,
  alongside the "filtered by" note fix above — the two were the same bug, in two places.
- **`parseCardSearchParams()` is not changed.** It still reads every facet param, so bookmarked and
  inbound links keep filtering correctly. This page simply no longer offers a widget to change them.
- **A read-only "filtered by" note** when any non-`q` facet is present **as a URL param** — a
  bookmarked or followed link, the case this note exists for: "Filtered by **Faction: Anarch** —
  set from the link you followed, and not editable here", with **Clear filter** (drops facets,
  keeps `q` and `view`) and **Edit in advanced search** (hands the same params to `/cards/advanced`,
  which can change them). Cheap — it reads already-parsed params, no new query.

  **Built from `rawParams`, not the parsed `params`** — corrected in the follow-up cycle that added
  type-ahead completion (see below). A facet folded in from an `f:`/`t:`/`s:`/`d:` token typed into
  `q` is a different case: it's now visible in the box itself (see the `defaultValue` fix below), so
  it doesn't need — and originally shouldn't have gotten — this note. Before the fix, a token-derived
  facet was described in the banner ("set from the link you followed") when nothing was followed,
  *and* had no hidden input carrying it forward, so pressing Search again silently dropped it
  (`q=f:anarch+virus` → 47 results; resubmit → `q=virus` → 78). Fixed by reading `describeFacets(
  rawParams)` here instead of reconstructing from `params.*`.
- **Keep the results controls**, shared with the advanced results page via
  `ResultsControls`: Display (List / Grid / Checklist / Names), **Sort**, **Per page**.
  Sort matters here: it currently lives inside the form being deleted, so without this it would
  disappear from the app's default card page entirely. Per-page matches the advanced results page.
- Results render through the shared `CardResultsList`, then `PaginationNav`.
- Page header gains an **Advanced search** link, pairing with the **Simple search** link on the
  advanced form so each page names the other.

The box stays above the results here, unlike the advanced form. One input fits there comfortably;
eleven rows do not. That is the whole reason the advanced side splits into two routes.

## Type-ahead completion (follow-up cycle)

`src/components/simple-search-box.tsx` — replaces the plain `<input name="q">` everywhere Simple
Search appears (home page, `/cards`, and `/cards/advanced`'s embedded field, per the companion
plan's follow-up). Built in response to a real usability gap: prefix values must be the exact
underlying code (`f:haas_bioroid`, not "Haas-Bioroid" or "haas bioroid"), case-sensitive, no
partial match, no spaces, no quoting — first documented as prose on `/cards/syntax`, then actually
fixed here instead of left as a footnote to memorise.

- Detects the `f:`/`t:`/`s:`/`d:` token the caret is currently inside (scanning to the nearest
  whitespace on either side) and, once a colon is typed, opens a dropdown of matching codes for
  that facet — faction/type/keyword from `src/lib/search/prefix-options.ts` (new, shared with
  `/cards/advanced`'s pickers rather than re-queried), side a static two-item list.
  Selecting one splices in just the code plus a trailing space, leaving the prefix letter's case
  and everything else in the box untouched.
- Full design (trigger detection, the splice algorithm, keyboard support, the no-JS fallback, and
  one known/accepted quirk around re-clicking an already-completed token) lives in the companion
  plan's "The Simple Search box's type-ahead" section — this is the one place both docs would
  otherwise duplicate the same design, so it's written once there.
- No-JS degrades to exactly what the box always was: a plain `<input type="text" name="q">`. Both
  simple-search sites (home, `/cards`) were already plain GET forms with no client JS at all before
  this; the type-ahead is additive, not a new requirement to use either page.

## Link repoints

Verified by grepping `/cards?` across `src/` — exactly two sites, not the longer list an earlier
draft assumed:

- **`src/components/facet-link.tsx`** — `/cards?{param}={value}` → `/cards/advanced?{param}={value}`.
  A "browse by facet" click should land where the filter is visible and editable.
- **`src/app/cards/[code]/page.tsx`** — the "Also printed in" pack links,
  `/cards?pack={code}` → `/cards/advanced?pack={code}`.

Explicitly **not** repointed, each for a reason:

- **`src/components/format-link.tsx`** already targets `/formats/{id}`, a detail page, not a `/cards`
  filter — nothing to change.
- **`src/components/site-header.tsx`**'s "Cards" nav link stays on `/cards`. The header is a
  lightweight shortcut from anywhere, which suits the simple page; the homepage's "Browse Cards"
  button is the one that should mean "go filter and browse."
- **`/cards/{code}` detail links** everywhere — unrelated to filtering.

## The asymmetry, stated plainly

`/cards` always matches with `word_similarity` **and** `ILIKE`. `/cards/advanced` matches with
`ILIKE` only unless fuzzy is ticked. **Advanced can therefore return fewer results than simple for
identical input.** Intended — casual search forgiving, precise search literal — but the single most
likely thing to read as a bug. Handled with copy on both sides: this page's hint says it searches
names and text together; the advanced form's fuzzy hint names simple search as the forgiving option.

## Known limitation, now more visible

Every literal substring match scores a flat `1.0` under `word_similarity`, so "relevance" order
collapses to alphabetical whenever results all match literally. Searching `bioroid` returns 23 cards
all tied at 1.0, so *Awakening Center* — which matches on rules text, not its title — sorts above all
four Haas-Bioroid identities. This ranking ceiling is already documented and accepted in
`plans/SEARCH_MATCHING.md`; nothing here changes it. Worth restating only because it is about to sit
behind the home page's main search box, which is considerably more prominent than where it lives now.

## Testing

No new query-layer logic, so no new engine tests beyond the companion plan's. What this plan needs:

- A pure rendering-logic test for the "filtered by" note: it renders for a URL carrying a genuine
  facet **URL param**, renders nothing when only `q` or nothing is set (including when `q` carries
  a prefix token that derives a facet — deliberately excluded, per the fix below), and its
  **Clear filter** href preserves `q` and `view` while dropping the facets.
- `parseCardSearchParams()`'s existing tests must pass untouched — proof the parser was not altered.
- **Follow-up cycle**: `simple-search-box.test.ts` — pre-mount/no-JS render test (a real
  `<input type="text" name="q">` with the right `defaultValue`) plus direct unit tests on the
  extracted pure token-detection/splice logic. Full detail in the companion plan's Testing section.

## Verification

Per `PROJECT_PLAN.md`'s standards: typecheck/lint clean, tests green, dev boot + curl, and a
separate production `build` + `start` + curl. Additions:

- **The engine still answers the same**: `curl 'localhost:3000/cards?q=bioroid'` returns the same 23
  cards as before the change, cross-checked against `psql`. The UI was simplified; the query was not.
- **Homepage markup**: grep the rendered HTML for a `<form action="/cards">` carrying a `q` input,
  and for `href="/cards/advanced"` on the Browse Cards button. Grep, don't paste the page.
- **No stray filter widgets left on `/cards`**: assert the rendered HTML contains no
  `name="faction"` / `name="pack"` / `name="format"` selects, and that the four dropdown-populating
  queries are gone from the page source.
- **Repoints are complete**: fetch a card detail page with keywords, a reprint and a legality line
  (`sure_gamble` and `sifr` are known-good real examples per `agent-reports/phase-6.md`), then grep
  for any surviving `href="/cards?faction=` / `?type=` / `?keyword=` / `?pack=`. A missed one lands
  on the simplified page with no way to see why results are narrowed — check explicitly rather than
  trusting the edit.
- **Old links still work**: `curl 'localhost:3000/cards?faction=anarch'` returns 253 cards and the
  HTML contains the "Filtered by" note and a working Clear filter link.
- **Follow-up cycle**: `curl 'localhost:3000/cards?q=f:anarch+virus'` renders the box as
  `value="f:anarch virus"` (raw, not the residual `"virus"`), shows **no** "filtered by" note (the
  facet came from a token, not a URL param), and resubmitting the same URL still returns 47 results
  (the fixed count — it silently dropped to 78 before the fix). The bookmarked-link case above is
  re-checked to confirm it's unaffected: banner still present, hidden `faction` input still carried.

## Deliberately not built

- The "filtered by" note on `/decklists` or `/rules` — neither has filters living on another page.
- Any change to how `q` matches.
- ~~Client-side autocomplete or search-as-you-type on either box~~ — **built in a follow-up cycle**,
  see "Type-ahead completion" above. The original reasoning ("neither needs JavaScript at all... is
  outside 'simplify to one box'") held until the prefix syntax's exact-code requirement turned out
  to be a real, frequent usability problem worth fixing rather than only documenting — see the
  companion plan's revision note. No-JS behavior is preserved: both boxes still degrade to a plain
  `<input>` with JavaScript off, per "Type-ahead completion" above.
