# Advanced Card Search "fuzzy matches" checkbox — bug investigation

## 0. Purpose and verdict up front

Investigating a bug report against `/cards/advanced`: checking "find fuzzy matches" and searching
Card Name or Card Text for a fuzzy string (report's example: `rezzd`, presumably for "rezzed")
allegedly (a) returns an implausibly large result count, and (b) — the specific claim flagged as
"makes no sense" — returns the **same result count** whether the string is searched against Title
or against Text.

**Verdict, backed by direct verification at three separate layers (raw SQL, direct TypeScript
function calls, and real HTTP requests to the running dev server): claim (a) is real and
confirmed with an identified root cause. Claim (b) — identical title vs. text counts — does not
reproduce anywhere. Every test run (28 distinct query terms, including the report's own `rezzd`)
produced different counts for title vs. text; the code that builds the two conditions is correctly
wired to the correct column in each case.**

Source tags used below: **[code-read]** = read directly from a file in this repo, quoted verbatim;
**[query-verified]** = a real query run this session against the live dev Postgres (`docker exec
jinteki-postgres-1 psql`), with actual output shown; **[fn-verified]** = the real
`parseAdvancedCardSearchParams`/`searchCardsAdvanced` TypeScript functions invoked directly via
`npx tsx` against the same live DB (bypasses HTTP/React, exercises the exact code path a request
runs); **[http-verified]** = a real `curl` request against the actually-running `pnpm dev` server
on `localhost:3000`, with the rendered result count extracted from the response HTML.

---

## 1. The query-building mechanism — `src/lib/search/cards-advanced.ts`

**[code-read]**, the per-field condition builder, lines 144–153:

```ts
function textCondition(
  column: Prisma.Sql,
  term: string,
  fuzzy: boolean,
): Prisma.Sql {
  const like = likePattern(term);
  return fuzzy
    ? Prisma.sql`(${column} ILIKE ${like} OR ${term} <% ${column})`
    : Prisma.sql`${column} ILIKE ${like}`;
}
```

**[code-read]**, where it's called, lines 160–170:

```ts
const title = params.title?.trim() || undefined;
const text = params.text?.trim() || undefined;
const fuzzy = params.fuzzy === true;

const conditions = buildFacetConditions(params);
if (title) {
  conditions.push(textCondition(Prisma.sql`title`, title, fuzzy));
}
if (text) {
  conditions.push(textCondition(Prisma.sql`text`, text, fuzzy));
}
```

This directly rules out three of the four hypotheses the task asked me to check:

- **(a) fuzzy applied to the wrong column** — no; `textCondition` takes the column as an explicit
  `Prisma.Sql` fragment parameter (`title` vs `text`), and the two call sites each pass the
  matching one.
- **(b) title/text OR'd together regardless of which field the user searched** — no; each
  condition is a separate array entry, joined with `" AND "` (line 172–174:
  `Prisma.sql\`WHERE ${Prisma.join(conditions, " AND ")}\``), and each is `push`ed only when its
  own field (`title`/`text`) is non-empty. Filling only Card Text produces exactly one condition,
  against `text`; filling only Card Name produces exactly one, against `title`. There is no path
  that adds both from a single filled field.
- **(c) a copy-paste bug reusing one field's WHERE clause for the other** — no; `textCondition` is
  parameterized by column, not duplicated per field, so there is only one implementation to get
  wrong, and it is invoked with two different column arguments.
- **(d) fuzzy checkbox not threaded through per-field, applied globally including elsewhere** —
  this one is real, but **it is the documented design, not a bug**: `fuzzy` is a single shared
  `boolean` (interface at lines 49–62, `fuzzy?: boolean`), not `titleFuzzy`/`textFuzzy`. That is
  exactly what `plans/ADVANCED_CARD_SEARCH_PLAN.md` line 57 specifies: `` `fuzzy` | single |
  `"1"` ORs `<%` in alongside `ILIKE` for both text fields ``. The plan's Form layout section also
  renders one shared "Matching" checkbox row (line 94–96), not two. So a shared fuzzy flag
  *applying the same fuzziness setting* to whichever of title/text is filled is intended — it does
  **not** mean title and text end up matching the *same rows*, since each still runs against its
  own column with its own term.

## 2. Client-side form wiring — `src/app/cards/advanced/page.tsx`

**[code-read]**, the three relevant form fields, lines 157–206:

```tsx
<input id="adv-title" type="text" name="title" defaultValue={params.title ?? ""} ... />
...
<input id="adv-text" type="text" name="text" defaultValue={params.text ?? ""} ... />
...
<input type="checkbox" name="fuzzy" value="1" defaultChecked={params.fuzzy} ... />
```

Distinct `name` attributes (`title`, `text`, `fuzzy`), no duplication, no shared `id`/`name`
collision. The criteria `<form>` (line 151) has `action="/cards/advanced/results"` and
`method="get"` — a plain, unscripted GET form, so the browser composes the query string natively;
there is no client-side JS step between the checkbox/inputs and the URL that could scramble which
value lands in which param. `src/app/cards/advanced/results/page.tsx` (lines 41–46) reads those
params straight through `parseAdvancedCardSearchParams(rawParams)` → `searchCardsAdvanced(params)`,
no intermediate transformation.

`parseAdvancedCardSearchParams` (`cards-advanced.ts` lines 94–136) reads `title`/`text` via
`firstParam(input, "title")`/`firstParam(input, "text")` — two separate calls against two separate
keys, and `fuzzy` via `firstParam(input, "fuzzy") === "1"` (line 115), an exact-match check (also
directly confirmed by the existing `parseAdvancedCardSearchParams` test block "is false for other
truthy-looking values", `cards-advanced.test.ts` lines 56–60, which is unrelated to this bug but
confirms the parser isn't doing anything looser than it looks).

No wiring defect found in either file.

## 3. Real-database verification

### 3a. Raw SQL — the report's own example, `rezzd` **[query-verified]**

Ran directly against the live dev Postgres (`docker exec jinteki-postgres-1 psql`), using the
exact condition shape `textCondition()` emits:

```sql
SELECT 'title_fuzzy', count(*) FROM "Card" WHERE (title ILIKE '%rezzd%' OR 'rezzd' <% title);
SELECT 'text_fuzzy',  count(*) FROM "Card" WHERE (text  ILIKE '%rezzd%' OR 'rezzd' <% text);
```

Result: `title_fuzzy = 0`, `text_fuzzy = 106`. **Not equal.**

### 3b. Direct function calls — the real app code path, bypassing HTTP **[fn-verified]**

Ran `parseAdvancedCardSearchParams` + `searchCardsAdvanced` directly via `npx tsx` against the same
live DB (script deleted after use, not committed):

```
titleParsed = { title: "rezzd", fuzzy: true, ... }  →  title fuzzy total: 0
textParsed  = { text:  "rezzd", fuzzy: true, ... }  →  text  fuzzy total: 106
title no-fuzzy total: 0        text no-fuzzy total: 0
simple search (q=rezzd) total: 106   ← equals text fuzzy, not title fuzzy (see §4)
```

Then swept 8 more plausible "typo of a common word" terms through the same real functions:

| term | title fuzzy | text fuzzy | simple search |
|---|---:|---:|---:|
| rezzd | 0 | 106 | 106 |
| rezzed | 0 | 128 | 128 |
| instal | 2 | 637 | 637 |
| damge | 0 | 0 | 0 |
| creditt | 2 | 822 | 822 |
| acess | 7 | 92 | 98 |
| trashd | 0 | 656 | 656 |
| runnr | 5 | 584 | 588 |

Title and text counts differ in every single row (`damge`'s 0/0 is a coincidental "both found
nothing," not "both found the same large set" — see §5 for why that distinction matters).

### 3c. Real HTTP requests against the actually-running dev server **[http-verified]**

`pnpm dev` was already running on `localhost:3000` this session. Hit
`/cards/advanced/results?title=<term>&fuzzy=1` and `?text=<term>&fuzzy=1` directly with `curl` and
extracted the rendered "`N cards found`" count from the response HTML:

| term | title (HTTP) | text (HTTP) |
|---|---:|---:|
| rezzd | 0 | 106 |
| rezzed | 0 | 128 |
| instal | 2 | 637 |
| creditt | 2 | 822 |
| runnr | 5 | 584 |

Matches §3b exactly, confirming the full request → parse → query → render pipeline behaves
identically to the isolated function calls — no divergence introduced by Next.js param handling,
routing, or rendering.

### 3d. Broader sweep — hunting specifically for an "equal AND large" case **[fn-verified]**

Since the report describes "implausibly large" **and** "identical" together, I swept 20 more
terms specifically to check whether any combination reproduces *both* at once (a coincidental 0/0
match doesn't satisfy the report — that's implausibly *small*, not large):

```
rezzd 0/106  acces 8/169  progrm 7/276  brech 0/0  subroutin 0/503  clickk 0/397
hardwar 0/97  resourc 2/114  identit 0/27  advanc 3/171  purg 1/21  expos 3/21
revea 4/179  conditon 1/13  netrunnr 0/0  corportion 1/0  cyberdec 4/0  iced 3/533
brakr 0/0  tracce 1/100
Any equal-and-large case found: false
```

Zero cases where title and text totals are both equal *and* above 50 rows, across 28 terms total
between this and §3b. Whenever the text-field total is large, the title-field total for the same
term is small (single digits or zero) — the opposite of "identical."

## 4. What the "implausibly large" complaint is actually catching (confirmed, real, with root cause)

The `text` counts above (637, 822, 656, 584 out of 2054 cards — 30–40%) are genuinely surprising
for a "fuzzy typo" search, and this part of the report holds up. Root cause, verified directly
**[query-verified]**:

```sql
SELECT word_similarity('creditt', 'gain 2[credit]');   -- = 0.75

SELECT 'ilike', count(*) FROM "Card" WHERE text ILIKE '%creditt%';   -- 0
SELECT 'wordsim', count(*) FROM "Card" WHERE 'creditt' <% text;      -- 822
```

`word_similarity`'s `<%` operator (`plans/SEARCH_MATCHING.md`'s own description: "asymmetric —
scores the best-matching contiguous substring of `title` against `q`") searches for the
**best-matching substring anywhere in the column**, not the whole-column similarity. Applied to
`Card.title` (typically 1–5 words), a near-miss of an unrelated common word rarely appears at all,
so title counts stay small. Applied to `Card.text` (full rules text, often several sentences), a
near-miss of an *extremely common Netrunner term* — "credit," "rez," "subroutine," "iced," "install"
— finds a real, verbatim occurrence of that common word somewhere in a large fraction of all cards'
text, and `word_similarity('creditt', 'credit') = 0.75` clears the 0.6 threshold easily. This isn't
a coding defect: it's the direct, foreseeable consequence of applying an asymmetric
best-substring-match operator to a long free-text column with a query that's a small edit-distance
away from a ubiquitous word. `plans/SEARCH_MATCHING.md` (lines 94–105) already documented the same
underlying phenomenon for `RuleSection.bodyText` ("this matters at scale... every section with a
literal mention scores the same 1.0 ceiling") — that prior finding was framed as a **ranking**
problem (mentions vs. topical relevance don't sort apart). Here on `/cards/advanced`, because fuzzy
is a **WHERE-clause inclusion test**, not just a ranking signal, the same mechanism produces an
inclusion (filter) problem, not just a ranking one: a huge fraction of the table passes the filter
at all, regardless of where it then sorts.

Note also from §3b: for `rezzd`/`rezzed`/`instal`/`creditt`/`trashd`, the **text-fuzzy total equals
the simple-search total** (`searchCards`'s always-on `q <% title OR title ILIKE ... OR q <% text OR
text ILIKE ...`). That's because in each case `title` fuzzy contributed 0 or few extra rows beyond
what `text` alone found, so the union collapses to ≈ the text-only set. This means simple search's
"plausible" result count the report describes is, for these terms, driven by the exact same
high-count text-fuzzy mechanism — it isn't obviously more restrained, it's just not being compared
field-by-field the way advanced search invites. Worth knowing when weighing whether this is
advanced-search-specific.

## 5. What does not reproduce, stated plainly

The report's central, specific, checkable claim — **searching the same string against Title vs.
against Text on `/cards/advanced` returns the same result count** — was tested at three independent
layers (raw SQL, direct function calls, real HTTP against the live dev server) across 28 different
query terms, including the report's own example (`rezzd`). It did not reproduce once. Title and
text counts differ substantially whenever either is non-trivial; the only case they coincide is
when both independently find zero rows, which is the opposite of the reported symptom (small, not
large). The query-building code (`cards-advanced.ts` lines 144–216) is correctly parameterized by
column and correctly gated by which field is actually filled, and the form (`page.tsx` lines
157–206) submits `title`/`text`/`fuzzy` as three distinct, correctly-named params with no
client-side transformation in between.

Given the current code (git log for this file: only `59287e8` "phase 7 implementation" and
`4bbc034` "updates to phase 7 advanced search," working tree clean, no fix commits since) is what
was tested, this specific symptom is not present in the codebase as it stands today.

## 6. Recommendation

- **No fix needed for the "identical counts" claim** — it doesn't reproduce; treat it as either a
  misreading of the results (see below) or based on a build/state this investigation couldn't
  access.
- **A plausible source of the "seems the same" impression**: the results-page summary line only
  ever shows a single, undifferentiated `"Fuzzy matching on"` badge (`results/page.tsx` line 68)
  regardless of whether Title, Text, or both are filled, and the "Matching" row on the form is one
  shared checkbox for both fields (`page.tsx` lines 182–206, matching the plan's intended design).
  A user toggling that one checkbox while switching which single field they've filled in would see
  the *same UI element* "doing the same thing" each time, even though the underlying row sets
  differ a lot — easy to misremember as "identical" without directly comparing the two count
  numbers, which is exactly what a fresh, deliberate side-by-side check (as done here) disproves.
  This is a UX-legibility observation, not a code defect, and not something this investigation was
  asked to fix.
- **The large-count problem (§4) is real and worth a follow-up design decision**, separate from
  this bug report: `Card.text` fuzzy matching against a query that's a near-miss of a common term
  can pass 30–40% of the table through the WHERE clause. Options for a future pass (not decided or
  built here, per the investigation-only scope): a higher `word_similarity` threshold specifically
  for the `text` condition (vs. `title`'s), surfacing the match count *before* commit-to-search so
  a user can see "800+ results" and reconsider, or accepting it as a known, documented limitation
  the way `plans/SEARCH_MATCHING.md` already accepted the analogous `RuleSection.bodyText` ranking
  gap.

## 7. Files referenced

- `src/lib/search/cards-advanced.ts` (lines 49–62, 94–136, 144–216) — query engine, read in full
- `src/lib/search/cards-advanced.test.ts` — existing test coverage, read in full; no test currently
  exercises "same term, title-only vs. text-only, compare counts" directly (the closest is the
  "title and text are ANDed" test, `cards-advanced.test.ts` lines 230–267, which tests both fields
  filled at once, not compared separately)
- `src/lib/search/cards.ts` (lines 293–370, `searchCards`) — the simple-search comparison path
- `src/app/cards/advanced/page.tsx` (lines 151–206) — the criteria form
- `src/app/cards/advanced/results/page.tsx` (lines 36–68) — results rendering, summary line
- `plans/SEARCH_MATCHING.md` — background on `word_similarity`/`<%`/`ILIKE`, and the prior
  `RuleSection.bodyText` "common word" ranking-gap finding this bug's root cause parallels
- `plans/ADVANCED_CARD_SEARCH_PLAN.md` (line 57, 94–96) — confirms shared single `fuzzy` param is
  by design, not a per-field bug
