# Phase 7 task report — split card search (simple + advanced)

Plan: `plans/PHASE_7_PLAN.md`, from `plans/ADVANCED_CARD_SEARCH_PLAN.md` and
`plans/SIMPLE_CARD_SEARCH_PLAN.md`. All eleven items built. Produced by a
build agent, then an independent verification agent, a defect-fix agent, and a
final independent regression agent — each given the working tree and told to
find fault with it rather than confirm it.

## What was built

**Items 1-3, foundations**
- `src/lib/search/types.ts`: `allParams()` beside `firstParam()`, for repeated
  query params. Both now strip NUL characters (see D1 below).
- `src/lib/search/cards.ts`: exported `extractOperators` and `ORDER_COLUMNS`;
  new `buildFacetConditions()` holding all six facet conditions (scalar `=` for
  one value, `= ANY($1)` for several, `"keywords" && $1` overlap for
  multi-subtype, unchanged JSONB `@>` for format). `searchCards()` calls it.
- `src/components/card-results.tsx`: `CardResultsList`, `parseView`,
  `hrefWithOverrides`, `View`/`VIEWS` — the four view branches moved verbatim
  out of `/cards/page.tsx`.
- `src/components/results-controls.tsx`: `ResultsControls` (Display / Sort /
  Per page) plus `ORDER_OPTIONS`, so both results pages are identical by
  construction rather than by discipline.
- `src/components/facet-picker.tsx` (`"use client"`): multi-value type-ahead
  picker. Hidden-input output inside the surrounding plain GET form, chips,
  substring highlighting, ticks on selected options, full keyboard support,
  click-outside close.

**Items 4-7, advanced search**
- `src/lib/search/cards-advanced.ts`: `parseAdvancedCardSearchParams()` and
  `searchCardsAdvanced()` — a separate engine from `searchCards()`, since the
  semantics differ (AND-of-two-columns vs OR-of-one-merged-query; opt-in vs
  always-on fuzziness).
- `src/app/cards/advanced/page.tsx`: the form, eleven rows, no results.
- `src/app/cards/advanced/results/page.tsx`: results, no filter widgets.
- `src/app/cards/syntax/page.tsx`: static reference, including the
  "Not supported" list.

**Items 8-11, simple search and repoints**
- `src/app/cards/page.tsx`: reduced to one `q` box. All seven selects and all
  four option-populating queries deleted, not left running.
  `parseCardSearchParams()` untouched, so inbound filtered links still work —
  hence the read-only "filtered by" note, with Clear filter and Edit in
  advanced search.
- `src/app/page.tsx`: search box above the buttons; Browse Cards → `/cards/advanced`.
- `src/components/facet-link.tsx` and `src/app/cards/[code]/page.tsx`
  repointed. `site-header.tsx` and `format-link.tsx` deliberately untouched.
- `src/lib/format.ts`: `CODE_LABEL_OVERRIDES` extended.
- Support module `src/lib/search/filter-summary.ts`; tests in
  `cards-advanced.test.ts`, `types.test.ts`, `filter-summary.test.ts`,
  `facet-picker.test.ts`, plus additions to `cards.test.ts` and
  `pagination.test.ts`.

## Deviations from the plan

1. **`ResultsControls` renders links, not `<select>`s.** The advanced results
   page has no surrounding form, so a `<select>` there would need client JS to
   do anything. Links keep both pages working with JS off. The mockups drew
   dropdowns; the mockups were wrong.
2. **`useSyncExternalStore` rather than the plan's literal
   `useState`+`useEffect`** for the picker's mount flag — the plan's version
   fails `react-hooks/set-state-in-effect` under this repo's lint config. Same
   SSR-then-client-swap semantics.
3. **Item 11 grew from one override to seven.** Rather than fixing only `ap`,
   all 104 keyword codes were checked against NRDB's own `display_subtypes` in
   `Card.raw`: `ai`→AI, `ap`→AP, `caissa`→Caïssa, `consumer_grade`→Consumer-grade,
   `g_mod`→G-mod, `next`→NEXT, `off_site`→Off-site. Independently re-derived
   during verification. All 11 type codes derive cleanly and have no
   display-name field in the synced data, so none were overridden.
4. **"Edit in advanced search" carries `q` into `title`** rather than dropping
   it. It does narrow (title-only vs title-or-text), but the form shows the
   value and lets you move it, so nothing disappears silently.
5. **`/cards`' search form carries hidden `view`/`order`/`pageSize`/facet
   inputs**, so re-searching doesn't reset presentation or silently drop an
   inbound filter. "Clear filter" is the way to drop one.
6. **`order=title` on advanced genuinely sorts by title**, where `searchCards()`
   historically fell through to relevance. This later turned out to be a real
   defect on the simple side rather than a deviation — see D7.

## Defects found in verification, and fixed

Found by the verification agents against the built tree, not by the build.

- **D1 — NUL byte returned HTTP 500.** `?title=a%00b` and `?q=a%00b` 500'd
  unhandled (Postgres `P2010`, `invalid byte sequence for encoding "UTF8"`).
  A crafted link could 500 a public page. Fixed by stripping NUL inside
  `firstParam`/`allParams`, which every search parser reads through — so this
  also closed the same hole on `/decklists` and `/rules`.
- **D2 — `order` validation walked the prototype chain.** `order in
  ORDER_COLUMNS` accepted `constructor`, `__proto__`, `toString`; the lookup
  then yielded a JS function, which Prisma bound as a parameter, emitting
  `ORDER BY $1 ASC` with `$1 = NULL` and silently disabling sorting. Fixed with
  a single `orderColumn()` helper using `hasOwnProperty.call`, covering both
  the validation and the lookup sites in both engines. The hole pre-existed in
  `cards.ts` and had been duplicated into the new engine.
- **D3 — LIKE metacharacters were not escaped.** `?title=%` returned all 2054
  cards while `/cards/syntax` promised "plain substring matches". Fixed with
  `likePattern()`, a single-pass `replace(/[\\%_]/g, "\\$&")` — single-pass
  specifically so escaping order can't double-escape. Applied to both the new
  engine and the pre-existing `searchCards()` `q` path.
- **D4 — `pageSize` outside {30, 60, 100} was accepted then silently reset.**
  `?pageSize=45` rendered 45 rows, then the form showed 30 and discarded the 45
  on re-submit. Fixed by restricting at the URL-parsing boundary via an
  optional third arg to `parsePageSize`, leaving `/decklists` and `/rules`
  clamp semantics untouched.
- **D5/D6 — copy and a stale comment.** "Filtered by **Faction: Anarch**" now
  matches the doc; `/cards`' page comment no longer describes a pre-search-box
  page.
- **D7 — `/cards?q=x&order=title` silently ignored the Title sort.**
  `params.order !== "title"` skipped the branch on the reasoning that title
  "behaves the same as the default" — true only without a `q`, since with one
  the default is relevance. The shared `ResultsControls` rendered Title as the
  active sort while rows came back by relevance: exactly the divergence item 2
  existed to prevent. Fixed by dropping the special case.

## Known limitations, accepted

- **The picker's hydrated chip UI has no automated coverage.** Only the
  pre-mount `<select multiple>` fallback is tested. The repo has no jsdom or
  testing-library and adding them was out of scope — same documented gap as
  `card-reference.tsx`. Needs a manual browser check.
- **The ranking ceiling is now more visible.** Every literal substring match
  scores a flat `1.0`, so relevance collapses to its `title ASC` tie-break
  whenever all matches are literal. Confirmed in psql that `q=virus`,
  `q=bioroid` and even the typo `q=efficency` each yield exactly *one* distinct
  score. Documented and accepted in `SEARCH_MATCHING.md`; unchanged here, but it
  now sits behind the home page's main search box.
- **`/decklists` and `/rules` still don't escape LIKE metacharacters** —
  `/decklists?q=%` returns all 74,242 rows. Same one-line `likePattern()` fix
  applies; deferred as out of scope per `PHASE_7_PLAN.md`.
- **`/decklists/{id}?order=__proto__` returns HTTP 500** — the same
  prototype-walk bug as D2, in `src/app/decklists/[id]/page.tsx:28,92`, where
  `ORDER_COMPARATORS["__proto__"]` yields a non-callable `Object.prototype`.
  Pre-existing (Phase 6, `3099159`), untouched by this phase, reported not fixed.
- **Out-of-range `page` renders "Page 9999 of 9"** — pre-existing in
  `pagination-nav.tsx`; a fix carries its own clamp-or-404 design question.

## Verification

Per `PROJECT_PLAN.md`'s standards. No schema change, no data writing, no new
auth-gated route — each confirmed rather than assumed (`git status prisma/`
empty; no `create`/`update`/`delete`/`upsert`/`$executeRaw` in any new or
changed file; the only `auth()` under `src/app/cards/` is pre-existing
favorites).

- **Typecheck** `npx tsc --noEmit` clean. **Lint** `npx eslint .` clean.
  **Tests** `npx vitest run` → **228 passed / 18 files** (140 at phase start).
- **Dev boot + curl** and a **separate production `next build` + `next start` +
  curl**, every check run against both.
- **Counts cross-checked against `psql`, not asserted**: advanced
  `?title=efficency` 0; `&fuzzy=1` 3; multi-facet
  `faction=anarch,criminal × type=event,program × keyword=virus` 34;
  `/cards?q=bioroid` 23; `/cards?faction=anarch` 253;
  `?title=f:anarch+virus` 1; `?title=f:anarch&faction=nbn` 241.
- **Fuzzy-off proven from the SQL Postgres received**, via `log_statement='all'`
  on the container rather than by reading source: fuzzy off emits
  `WHERE title ILIKE $1` with **zero** occurrences of `word_similarity` or `<%`,
  including with all six facets applied; fuzzy on emits
  `(title ILIKE $1 OR $2 <% title)`.
- **Injection**: 64 requests (4 payloads × 16 inputs, including multi-value
  facets) — `'; DROP TABLE "Card"; --`, backslashes, unicode, 5000-char
  strings, array literals with embedded quotes. Every value arrived as a bind
  parameter. `Card` 2054 rows before and after; 18 tables intact.
- **`likePattern()` proven against Postgres** with synthetic rows: the `%`
  pattern matches only the row containing a literal `%`, `\\` only the
  two-backslash row, and so on, where the naive pre-fix pattern matched all of
  them. Observed bind values: `%` → `%\%%`, `\\` → `%\\\\%`, `snake_case` →
  `%snake\_case%`. No real card contains `%`, `_` or `\` in title or text, so
  the live "0 results" is correct rather than a false negative.
- **Refactor proven behaviour-preserving**: `searchCards()`'s scalar path emits
  byte-identical SQL to the pre-refactor inline version (no `= ANY(array)`
  substitution), and `/cards?q=bioroid&view=list` renders the same 23 codes in
  the same order.
- **No regression outside cards**: a differential unit test of `parsePageSize`
  (37 boundary inputs) asserted new-with-arg-omitted ≡ the pre-change
  implementation, 41/41. `/decklists` and `/rules` pageSize behaviour
  unchanged (45→45, 999→100, 0→30). `decklists.ts` and `rule-sections.ts`
  have empty `git status`.
- **Form renders no results**: zero result rows, zero count text, zero
  pagination on `/cards/advanced`.
- **No-JS path**: the server-rendered form ships 4 real
  `<select multiple name="type|faction|keyword|pack">` with 219 options.
- **`/cards` genuinely stripped**: zero `<select>` elements of any kind; the
  four option-populating queries appear only in `/cards/advanced/page.tsx`.
- **Repoints complete**: `sure_gamble` and `sifr` emit only
  `/cards/advanced?…` facet links; zero surviving `/cards?faction=|type=|
  keyword=|pack=` under `src/`.
- **`/cards/syntax` examples checked against the database**: `f:anarch` 253,
  `t:operation` 218, `s:virus` 41, `d:runner` 928, `f:anarch s:virus` 27.

One claim did not survive checking and is corrected here: an intermediate
report said `cards.test.ts` had an empty `git diff`. It was empty after the
build, but the fix pass added regression tests to it (84 lines added, 0
deleted). The plan's actual requirement — that its *pre-existing assertions*
pass unedited — holds; the phrasing did not.
