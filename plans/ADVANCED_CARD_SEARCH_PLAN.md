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

**Prefix tokens inside `title`/`text`**: both fields independently run through the existing
`extractOperators()` from `src/lib/search/cards.ts`, folding `f:`/`t:`/`s:`/`d:` tokens into the
matching facet and stripping them from the residual text. Precedence is unchanged from
`PHASE_6_PLAN.md` item 6: **an explicit picker/dropdown value always wins over a token.** A token
only fills a facet left empty. When both boxes carry a token for the same field, `title`'s is
folded first — arbitrary but deterministic, and documented on `/cards/syntax`.

## Form layout

One criterion per row: label in a fixed left column, field plus its hint text on the right, rows
separated by a hairline rule. Rows in order:

1. **Card Name** — text input. Hint names the prefix syntax and links to `/cards/syntax`.
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

Then **Search** and a **Reset** link. Page header carries **Simple search** and **Home** links.

Sort and page size appear here *and* on the results page. Scryfall does the same (research §2:
"sort/display preference is set once, up front, alongside the filters"), and it means you can
commit before searching or adjust after.

## The facet picker

`src/components/facet-picker.tsx` — the one genuinely new interaction. Click to open; pick from the
list or type to narrow it; click again to add another. Selected values sit as removable chips inside
the box. Four states, all mocked: empty, open-with-full-list, typing-with-matches-highlighted, and
several-chosen.

**This is the first client component in the app**, and it cuts against the note carried since
Phase 4 that "URL searchParams are the entire source of truth — no client component, no local
state." The exception is deliberate and contained:

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
- **Prefixes** — table of `f:` faction, `t:` type, `s:` subtype, `d:` side, each with a real
  example (`f:anarch`, `t:operation`, `s:virus`, `d:runner`). Confirm codes against the database at
  build time rather than trusting this list.
- **Precedence** — an explicit picker value beats a prefix token.
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
- `cards-advanced.test.ts` (new):
  - Parsing (no DB): each prefix recognised in `title` alone, in `text` alone, in both for
    different fields; case-insensitivity; an explicit facet beating a same-field token in either
    box; `fuzzy=1` vs. absent; repeated params collected into arrays via `allParams()`.
  - Real DB: `title` with fuzzy off **excludes** a known fuzzy-only match (`efficency` → 0 rows),
    and with fuzzy on **includes** it (→ 3 rows) — the opt-out default must actually hold.
  - `title` + `text` both set returns the **intersection** of the two single-field result sets,
    cross-checked against two separate queries.
  - Multi-value: `type=[event,program]` equals the union of each alone; combined with
    `faction=[anarch,criminal]` and `keyword=[virus]` matches a direct `prisma.card.count`.
  - Multi-value `keyword` uses overlap, not equality — a card with any one of two keywords matches.
- `facet-picker` — a small render test that the pre-mount fallback is a real
  `<select multiple>` carrying the right options and selections.

## Verification

Per `PROJECT_PLAN.md`'s standards: typecheck/lint clean, `pnpm test` green, dev boot + curl, and a
**separate** production `build` + `start` + curl. No schema change, no data writing, no new
auth-gated route. Additions:

- **Real requests across several combinations**, each diffed against a direct `psql` count:
  `?title=efficency` (0) vs. `?title=efficency&fuzzy=1` (3);
  `?faction=anarch&faction=criminal&type=event&type=program&keyword=virus` (34);
  `?title=f:anarch+virus` (token applies) vs. `?title=f:anarch&faction=nbn` (explicit wins).
- **The form renders no result rows** — assert the absence of the results list on `/cards/advanced`,
  not just the presence of the form.
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
