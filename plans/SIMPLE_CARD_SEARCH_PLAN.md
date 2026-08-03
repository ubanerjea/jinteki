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

## Sequencing

The link repoints below target `/cards/advanced`, which must exist first or land in the same change.

## Home page — `src/app/page.tsx`

1. **A search box directly under the tagline, above the three buttons.** A plain
   `<form method="get" action="/cards">` containing one `q` text input and a submit button, styled
   as a single rounded-full control to match the page's existing button vocabulary, capped around
   470px and centred. Submitting lands on `/cards?q=…` — no new route, no new query path, no client
   component.
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
- **`parseCardSearchParams()` is not changed.** It still reads every facet param, so bookmarked and
  inbound links keep filtering correctly. This page simply no longer offers a widget to change them.
- **A read-only "filtered by" note** when any non-`q` facet param is present: "Filtered by
  **Faction: Anarch** — set from the link you followed, and not editable here", with **Clear filter**
  (drops facets, keeps `q` and `view`) and **Edit in advanced search** (hands the same params to
  `/cards/advanced`, which can change them). Cheap — it reads already-parsed params, no new query.
- **Keep the results controls**, shared with the advanced results page via
  `ResultsControls`: Display (List / Grid / Checklist / Names), **Sort**, **Per page**.
  Sort matters here: it currently lives inside the form being deleted, so without this it would
  disappear from the app's default card page entirely. Per-page matches the advanced results page.
- Results render through the shared `CardResultsList`, then `PaginationNav`.
- Page header gains an **Advanced search** link, pairing with the **Simple search** link on the
  advanced form so each page names the other.

The box stays above the results here, unlike the advanced form. One input fits there comfortably;
eleven rows do not. That is the whole reason the advanced side splits into two routes.

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

- A pure rendering-logic test for the "filtered by" note: it renders for a URL carrying a facet
  param, renders nothing when only `q` or nothing is set, and its **Clear filter** href preserves
  `q` and `view` while dropping the facets.
- `parseCardSearchParams()`'s existing tests must pass untouched — proof the parser was not altered.

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

## Deliberately not built

- Client-side autocomplete or search-as-you-type on either box. Both stay plain server-rendered GET
  forms — unlike the advanced facet pickers, neither needs JavaScript at all. Autocomplete would need
  a suggestions endpoint and real UX design of its own, and is outside "simplify to one box."
- The "filtered by" note on `/decklists` or `/rules` — neither has filters living on another page.
- Any change to how `q` matches.
