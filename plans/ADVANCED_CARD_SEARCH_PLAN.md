# jinteki — Advanced Card Search Design

## Context

`agent-reports/scryfall-ux-research.md` §2 and `agent-reports/netrunnerdb-ux-research.md` §2/§5
describe the same pattern from two products: a **structured form that is a second view onto the
same query the free-text box accepts**, with one criterion per row and a linked syntax reference.
`/cards` today is a hybrid — one `q` box plus seven `<select>`s wrapped onto a single line. This
doc splits that hybrid; `plans/SIMPLE_CARD_SEARCH_PLAN.md` is the companion covering what `/cards`
becomes, and the two must be read together.

**This design was revised against a visual mockup** (rev 2) after an initial pass put all filters
on one line and results on the same page as the form. The decisions below reflect the mockup, which
is the current source of truth for layout and interaction.

**Revised again after launch**, in a follow-up cycle: the prefix syntax (`f:`/`t:`/`s:`/`d:`) was
removed from Card Name and Card Text — this page already has explicit pickers for the exact same
four facets, which made a second, code-memorising way to set them redundant and, per the usability
gap that prompted the change, actively confusing (values must be an exact underlying code like
`haas_bioroid`, case-sensitive, no partial match, no spaces — `f:haas bioroid` silently filters to a
nonexistent faction "haas" plus a literal-text search for "bioroid", finding nothing). Prefix syntax
now lives in Simple Search only, which gained type-ahead completion for it and a field embedded
directly on this page. This doc describes the page as it now stands, not as a historical record —
see "Prefix tokens", "Form layout", and "Client components" below.

Hard requirement, non-negotiable: **advanced search must not run `word_similarity`/`<%` unless the
user explicitly opts in.** `plans/SEARCH_MATCHING.md` OR's `<%` into every `q` match today to fix a
dilution bug for *casual* search — but that same fuzziness is what a precise search should be able
to turn off. Default is plain `ILIKE`; a checkbox adds `<%` back.

## Sequencing

`/cards/advanced` must exist before the companion plan's link repoints land, since those links
target it. Build this first or in the same change.

## Routes

| Route | Job |
|---|---|
| `/cards/advanced` | The form. **Renders no results at all.** |
| `/cards/advanced/results` | Results. Display / sort / page-size controls only — no filters. |
| `/cards/syntax` | Static syntax reference, linked from the form. |

**Why results get their own route**: the form is eleven rows tall; results can't sit under it
usefully. This is also the difference from simple search, where a single box *does* sit above its
results comfortably (see the companion plan). A dedicated route also keeps `/cards` free to stay
the simple page rather than having to render two different param schemes.

## Query model

Param names are deliberately distinct from `/cards`' `q`, so the two pages' URLs never collide.

| Param | Cardinality | Meaning |
|---|---|---|
| `title` | single | free text, matched against `Card.title` only |
| `text` | single | free text, matched against `Card.text` only |
| `fuzzy` | single | `"1"` ORs `<%` in alongside `ILIKE` for both text fields; anything else = `ILIKE` only |
| `faction`, `type`, `keyword`, `pack` | **repeatable** | multi-value facets |
| `side`, `format` | single | single-value facets |
| `order` | single | `title` / `faction` / `type`, else relevance-or-title fallback |
| `page`, `pageSize`, `view` | single | `pageSize` ∈ {30, 60, 100}; `view` shared with `/cards` |

**Combination semantics**: **OR within a facet, AND across facets.** `type=event&type=program`
means "Event or Program"; adding `faction=anarch` narrows that to Anarch ones. Free-text `title`
and `text` are also ANDed with each other and with the facets — this is the deliberate break from
`/cards`' single box, which ORs title against text. Splitting the box into two fields only makes
sense if each narrows; that is why Scryfall and NRDB both give Name and Text separate fields.

**`title`/`text` do not read prefix tokens.** `f:anarch` typed into either box is searched as
literal text (`title ILIKE '%f:anarch%'`), not folded into the Faction facet. This page already has
explicit pickers for `faction`/`type`/`keyword`/`side` (below); prefix parsing on top of those
pickers was a second, error-prone way to set the same four facets — dropped rather than kept as a
confusing duplicate. Prefix syntax survives only in Simple Search (the "Simple search" field below,
plus `/cards` and the home page), which has no pickers of its own to duplicate and now offers
type-ahead completion so the exact-code requirement isn't something you have to memorise.

## Form layout

**A "Simple search" field sits above everything else**, in its own `<form method="get"
action="/cards">`, visually set apart (border/divider) from the criteria form below it — labeled
exactly "Simple search", a `SimpleSearchBox` plus a submit button, functionally identical to
`/cards`' own box (same engine, same title-or-text-together matching, same prefix support). It is
not part of the criteria form and does not touch `/cards/advanced/results` — submitting it
navigates to `/cards`, same destination as the page header's "Simple search" link, just with a
working box attached rather than only a link. This does not violate "renders no results at all"
below: that requirement is about the criteria form specifically.

Below it, the criteria form: one criterion per row, label in a fixed left column, field plus its
hint text on the right, rows separated by a hairline rule. Rows in order:

1. **Card Name** — text input. Hint: "Matches the card's title only." No prefix syntax here — see
   "Prefix tokens" above.
2. **Card Text** — text input. Hint states that filling both boxes requires a card to match both.
3. **Matching** — the fuzzy checkbox, unchecked. Hint: "Off by default — searches are plain
   substring matches unless you tick this." Also names simple search as the always-forgiving
   option, per the asymmetry note below.
4. **Type** — multi-value picker.
5. **Faction** — multi-value picker.
6. **Subtype** — multi-value picker (`Card.keywords`).
7. **Pack** — multi-value picker.
8. **Side** — plain `<select>`, "Any side" default. Two values; a picker would be silly.
9. **Format** — plain `<select>`, "Any format" default. Six values, and you'd never want two.
10. *(Preferences subheading)* **Sort by** — plain `<select>`.
11. **Cards per page** — plain `<select>`: 30 / 60 / 100.

Then **Search** and a **Reset** link. Page header carries **Simple search** and **Home** links —
the header's "Simple search" is a plain link to `/cards`, distinct from the functioning field above
the criteria form.

Sort and page size appear here *and* on the results page. Scryfall does the same (research §2:
"sort/display preference is set once, up front, alongside the filters"), and it means you can
commit before searching or adjust after.

## Client components

Two, both deliberate, contained exceptions to the note carried since Phase 4 that "URL searchParams
are the entire source of truth — no client component, no local state." `simple-search-box.tsx` was
added in the follow-up cycle that removed prefix parsing from Card Name/Card Text (above); both
share small pieces (`useHasMounted`, `HighlightedLabel`, both promoted from module-private to
exported in `facet-picker.tsx`) but are separate components, not variants of one, since the
interaction models genuinely differ: a picker manages a discrete array of chosen values, the search
box holds one arbitrary string that may contain zero or more `prefix:value` tokens mixed with
ordinary words.

### The facet picker

`src/components/facet-picker.tsx`. Click to open; pick from the list or type to narrow it; click
again to add another. Selected values sit as removable chips inside the box. Four states, all
mocked: empty, open-with-full-list, typing-with-matches-highlighted, and several-chosen.

The exception is deliberate and contained:

- The picker's only output is a set of `<input type="hidden" name={name}>` elements inside the
  surrounding plain `<form method="get">`. The URL remains the source of truth; the picker just
  helps compose it. No fetching, no client-side routing, no state that outlives submit.
- **Progressive enhancement, not a JS requirement.** The component renders a plain
  `<select multiple name={name}>` until it has mounted, then swaps to the chip UI
  (`const [mounted, setMounted] = useState(false)` + `useEffect(() => setMounted(true), [])`).
  With JavaScript off the form still works, just plainly. This costs one state flag and avoids a
  hydration mismatch, which is why it beats a `<noscript>` block — hidden inputs inside a
  CSS-hidden container would still submit and double up with the fallback's values.
- Options are passed in from the server component that already queries them; the picker performs
  no data access of its own.

Keyboard support is required, not optional: arrow keys move the highlight, Enter selects,
Backspace on an empty input removes the last chip, Escape closes. Typed matches are highlighted
inside the option labels so it's clear why each is listed.

### The Simple Search box's type-ahead

`src/components/simple-search-box.tsx`. Prefix-syntax completion for the one freeform `q` box —
used on the home page, `/cards`, and the new "Simple search" field above. Not a fork of the facet
picker: it operates on a substring of an arbitrary string via caret position, not on a discrete
array.

- **Trigger**: on every `onChange` and `onSelect` (typing, and the caret moving without the value
  changing — arrow keys, a click), find the "current token" by scanning from the caret backward and
  forward to the nearest whitespace or string boundary. If that token matches
  `/^(f|t|s|d):(\S*)$/i` (looser than `OPERATOR_TOKEN` — a bare `f:` with nothing typed yet still
  opens the dropdown), open it against that prefix's option list; otherwise close it.
- **Filtering**: match `getPrefixOptions()`'s faction/type/keyword/side lists (`src/lib/search/
  prefix-options.ts`, new — the same three queries `/cards/advanced` already ran, factored out so
  home/`/cards`/`/cards/advanced` share one call instead of tripling them, plus a static two-item
  side list) by label or code containing the typed text, case-insensitive, up to 8 shown,
  highlighted the same way the facet picker's option labels are.
- **Accepting a suggestion — splice by offset, not split/join.** Only the text after the colon is
  replaced with the option's code plus a trailing space; the prefix letter and its exact case are
  left untouched (`F:ana` → `F:anarch `, never rewritten to `f:`); everything before and after the
  token survives unchanged. Caret moves to just past the inserted space. Completing a token that
  isn't at the string's end can leave a double space where the replacement meets existing text —
  confirmed harmless: `q.split(/\s+/)` in `extractOperators()`/`parseCardSearchParams()` already
  collapses runs of whitespace, so the double space never reaches a facet or residual-text value.
- **No-JS fallback is trivial here, unlike the picker.** Pre-mount, this is just an ordinary
  `<input type="text" name="q">` — that already is what a non-JS user needs, since the box was
  always plain text. No separate fallback markup.
- Keyboard: same shape as the picker — arrows move the highlight (wrapping), Enter accepts and
  `preventDefault`s so the form doesn't submit while a match is highlighted, Escape closes,
  click-outside closes. The handler only intercepts Enter while a token with at least one match is
  open, so Enter submits normally otherwise.
- **Known, accepted limitation**: clicking back into an already-completed token reopens the
  dropdown showing the existing value as the sole match, so the next Enter re-completes to the same
  string instead of submitting — one keypress swallowed, no data loss, no wrong result. Left as-is;
  distinguishing "reopened on an unchanged value" from a genuine edit isn't worth the complexity.
- Not in scope: suggesting the four prefix letters themselves, fuzzy/typo-tolerant matching of
  option values, pixel-precise caret positioning of the dropdown.

## Results page

- Page header: **Search results**, with **Edit search** (back to the form, every value restored
  from the URL) and **Home**.
- A **read-only summary** of the active query — "Type Event, Program · Faction Anarch, Criminal ·
  Subtype Virus". Without it the page can't explain its own result count, since the filters now
  live on another page.
- One controls row: result count on the left; **Display** (List / Grid / Checklist / Names),
  **Sort**, and **Per page** on the right. Nothing else.
- Results via the shared `CardResultsList`, then `PaginationNav`.

## Shared extractions (refactor, no behaviour change)

`/cards/page.tsx` currently inlines ~150 lines of view-branch JSX. Both results pages need it, so
extract verbatim:

- **`src/components/card-results.tsx`** — `CardResultsList({ items, view })` with the existing four
  branches moved as-is, plus the view-toggle links and `hrefWithOverrides()`.
- **`src/components/results-controls.tsx`** — the Display / Sort / Per page cluster, used by both
  `/cards` and `/cards/advanced/results` so they stay identical.

From `src/lib/search/cards.ts`, export `extractOperators` and `ORDER_COLUMNS`, and extract:

```ts
export function buildFacetConditions(params: {
  faction?: string | string[]; side?: string; type?: string | string[];
  keyword?: string | string[]; pack?: string | string[]; format?: string;
}): Prisma.Sql[]
```

It holds the six existing `if (params.X)` blocks, generalised to accept arrays. `searchCards()`
calls it too, so single-value and multi-value paths share one implementation. Multi-value SQL:

- `faction` / `type` / `pack` — `"factionCode" = ANY(${values})`
- `keyword` — array overlap, `"keywords" && ${values}`, since one keyword is `= ANY("keywords")`
  but several needs overlap semantics
- `side` / `format` — unchanged single-value equality and JSONB containment

`src/lib/search/types.ts` gains `allParams(input, key): string[]` beside the existing
`firstParam()`, returning `[]` when absent. `SearchParamsInput` already types repeated keys as
`string[]`, so no type change is needed.

## `src/lib/search/cards-advanced.ts` (new)

A **separate engine** from `searchCards()`, not a branch inside it. The semantics genuinely differ
(AND-of-two-columns vs. OR-of-one-merged-query; opt-in vs. always-on fuzziness), and keeping them
apart means the shipped, tested simple path carries zero regression risk.

```ts
export interface AdvancedCardSearchParams {
  title?: string; text?: string; fuzzy?: boolean;
  faction?: string[]; side?: string; type?: string[];
  keyword?: string[]; pack?: string[]; format?: string;
  order?: string; page?: number | string; pageSize?: number | string;
}

export async function searchCardsAdvanced(params): Promise<PagedResult<CardSummary>> {
  const conditions = buildFacetConditions(params);
  if (params.title) {
    const like = `%${params.title}%`;
    conditions.push(params.fuzzy
      ? Prisma.sql`(title ILIKE ${like} OR ${params.title} <% title)`
      : Prisma.sql`title ILIKE ${like}`);
  }
  if (params.text) { /* same shape against `text` */ }
  // WHERE ... AND ...; ORDER BY explicit column, else fuzzy relevance, else title ASC
}
```

Ordering: an explicit `order` wins; otherwise, if `fuzzy` and at least one text field is set, rank
by `GREATEST(word_similarity(title-term, title), word_similarity(text-term, coalesce(text,'')))`;
otherwise `title ASC`. Every user value goes through `Prisma.sql` parameterisation — never
`$queryRawUnsafe`, per `cards.ts`'s header rule.

## `/cards/syntax`

Static, no DB query. Documents **only what is implemented**, and names what is not — per
`scryfall-ux-research.md` §8's caution against porting a grammar this card pool doesn't need.

- **Title and Text** — plain case-insensitive substring against that one column. Both filled means
  both must match. No quoted phrases; state this as a known limit.
- **Fuzzy matching** — plain-language explanation with a real worked example: `efficency` finds
  nothing on its own but finds *Bioroid Efficiency Research* with fuzzy on (verified). Note that
  loosely-related cards may appear, ranked below solid matches.
- **Prefixes work in Simple Search only** — the home page's box, `/cards`, and the "Simple search"
  field on this page. They do **not** apply to this page's Card Name/Card Text fields (see "Prefix
  tokens" above) — say so explicitly, since anyone who read this page before the follow-up cycle
  would otherwise assume the old behavior still holds. Table of `f:` faction, `t:` type, `s:`
  subtype, `d:` side, each with a real example (`f:anarch`, `t:operation`, `s:virus`, `d:runner`).
  Confirm codes against the database at build time rather than trusting this list. Mention that
  Simple Search's box offers type-ahead completion for these values (above) — the exact-code
  requirement below still applies if you type by hand and ignore the suggestions, but most users
  won't need to know it exists.
- **Value format, still true and still the reason type-ahead exists**: the value is the exact
  underlying code, not the display name (lowercase, underscore instead of a space or hyphen —
  `f:haas_bioroid`, not "Haas-Bioroid"); no spaces and no quoting (`f:haas bioroid` parses as two
  words, filtering to a nonexistent faction "haas" and searching "bioroid" as literal text — not
  what was intended); exact match, not substring (`f:anar` matches nothing); case-sensitive
  (`f:ANARCH` matches nothing — only the prefix letter itself ignores case). Verify every example
  against the database, not copied from this list.
- **Precedence** — a filter already present as a URL param (e.g. from a bookmarked link) beats a
  same-field prefix token in `q`; a repeated prefix for the same field keeps only the first.
- **Not supported** — negation (`-f:anarch`), OR (`|`), quoted phrases, regex, and any other prefix
  including NRDB's `x:`/`a:`/`e:`. Unrecognised prefixes are treated as literal text.

## The asymmetry to soften, not hide

`/cards` matches with `word_similarity` **and** `ILIKE`, always. `/cards/advanced` matches with
`ILIKE` only unless fuzzy is ticked. So **advanced can return fewer results than simple for the
same word**, which reads as broken unless explained. Both plans intend this — casual search should
be forgiving, precise search literal — so the fix is copy, not behaviour: the fuzzy row's hint on
the form names simple search as the always-forgiving option.

## Testing

- `cards.test.ts` — unchanged assertions. The `buildFacetConditions`/`extractOperators` extraction
  must not alter `searchCards()` behaviour; prove it by the suite passing untouched.
- `cards-advanced.test.ts`:
  - **`title`/`text` are pure literal strings, not folded**: `parseAdvancedCardSearchParams({
    title: "f:anarch" })` yields `title: "f:anarch"` verbatim with `faction` left empty — this
    pins the follow-up cycle's removal of prefix parsing from these two fields. (The original spec
    for this test — a prefix recognised in title/text, precedence between the two boxes — described
    behavior that no longer exists and was removed, not fixed, from this suite.)
  - Real DB: `title` with fuzzy off **excludes** a known fuzzy-only match (`efficency` → 0 rows),
    and with fuzzy on **includes** it (→ 3 rows) — the opt-out default must actually hold.
  - `title` + `text` both set returns the **intersection** of the two single-field result sets,
    cross-checked against two separate queries.
  - Multi-value: `type=[event,program]` equals the union of each alone; combined with
    `faction=[anarch,criminal]` and `keyword=[virus]` matches a direct `prisma.card.count`.
  - Multi-value `keyword` uses overlap, not equality — a card with any one of two keywords matches.
- `facet-picker` — a small render test that the pre-mount fallback is a real
  `<select multiple>` carrying the right options and selections.
- `simple-search-box.test.ts` (new): pre-mount/no-JS render test — a real `<input type="text"
  name="q">` with the right `defaultValue` — plus direct unit tests on the extracted pure
  `findPrefixToken`/`spliceCompletion` logic (the one part of this component verifiable without a
  browser; this repo has no jsdom/testing-library, so the hydrated dropdown/keyboard behavior stays
  an accepted, documented gap, same as the facet picker's chip UI).

## Verification

Per `PROJECT_PLAN.md`'s standards: typecheck/lint clean, `pnpm test` green, dev boot + curl, and a
**separate** production `build` + `start` + curl. No schema change, no data writing, no new
auth-gated route. Additions:

- **Real requests across several combinations**, each diffed against a direct `psql` count:
  `?title=efficency` (0) vs. `?title=efficency&fuzzy=1` (3);
  `?faction=anarch&faction=criminal&type=event&type=program&keyword=virus` (34).
- **Prefix tokens in Card Name/Card Text are literal, not folded** — `?title=f:anarch` on
  `/cards/advanced/results` is 0 (matches `title ILIKE '%f:anarch%'`, not `factionCode='anarch'`);
  `?text=s:virus` is 0 (matches `text ILIKE '%s:virus%'`, not the Virus subtype, which is 41).
- **The two forms on `/cards/advanced` are disjoint** — the new "Simple search" field's `<form>`
  has `action="/cards"` and carries only a `q` input, zero hidden params from the criteria form; the
  criteria form still has `action="/cards/advanced/results"`.
- **The form renders no result rows** — assert the absence of the results list on `/cards/advanced`,
  not just the presence of the form. This includes the new Simple Search field, which is a separate
  form that navigates away on submit rather than rendering anything in place.
- **Picker works without JavaScript** — fetch `/cards/advanced` and confirm the server-rendered
  HTML contains `<select multiple>` elements with the real option lists, since that is what a no-JS
  client receives.
- **`/cards` renders identically after the `CardResultsList` extraction** — same query and view,
  diff the rendered card codes and their order before and after.
- **Syntax page examples are real** — spot-check each worked example against the database rather
  than trusting the doc.

## Known follow-ups, deliberately not built

- Quoting, negation, OR syntax, regex, and NRDB's other prefixes — named as non-goals on
  `/cards/syntax` rather than silently absent.
- Applying this pattern to `/decklists` or `/rules` — neither has the facet set to justify it,
  unchanged from `PHASE_6_PLAN.md`'s deferral.
- Saved searches, search history, or sharing beyond the plain URL.
- Suggesting the four prefix letters themselves in the type-ahead (it only triggers once a full
  `letter:` is typed), fuzzy/typo-tolerant matching of option values in the dropdown, and
  pixel-precise caret positioning of the dropdown — all named directly in "The Simple Search box's
  type-ahead" above, not left implicit.
