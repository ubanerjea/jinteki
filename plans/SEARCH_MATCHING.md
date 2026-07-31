# Search matching: trigram similarity vs. substring, and why we use both

## The gap

`searchCards`/`searchDecklists`/`searchRuleSections` filter free-text `q` with
pg_trgm's `%` operator (`title % ${q}`), i.e. `similarity(title, q) > 0.3`.
`similarity()` is symmetric and whole-string: it compares the full trigram
set of both strings. A short query against a long title gets diluted by all
the title's *non-matching* trigrams, so it can score below threshold even
when the query is a clean substring — e.g.
`similarity('Bioroid Efficiency Research', 'bioroid') = 0.286`, under the
0.3 cutoff, so `q=bioroid` returns nothing even though the card obviously
matches.

## Options considered

- **`word_similarity(q, title)` / `<%` operator** — asymmetric: scores the
  best-matching contiguous substring of `title` against `q`, instead of the
  whole string. Fixes the dilution problem (`word_similarity('bioroid',
  'Bioroid Efficiency Research') = 1.0`) and still returns a numeric score
  usable for `ORDER BY` relevance. Uses the same Phase 1 `pg_trgm` GIN
  indexes — no schema change.
- **Plain `ILIKE '%q%'`** — exact substring, no fuzziness/typo tolerance, and
  no relevance score to rank by. Initially assumed to be an unindexed
  sequential scan and therefore a performance risk, but measured directly
  (`EXPLAIN ANALYZE`): 2.3ms full seq scan over 2054 cards, 37.6ms on 74k
  decklists — and the decklist case was *already* index-accelerated, because
  `gin_trgm_ops` also supports `LIKE`/`ILIKE` pattern matching (extracts
  trigrams from the literal part of the pattern), not just the similarity
  operators. Negligible cost at this dataset's size either way.

## Decision

Use both, OR'd together: `word_similarity(${q}, title) > threshold OR title
ILIKE '%' || ${q} || '%'`. `word_similarity` is the primary relevance-ranked
match; `ILIKE` is a cheap safety net for anything it still misses (very
short queries, or dilution against the long `text`/`bodyText` columns).
Performance was ruled out as a reason to avoid `ILIKE` — at 2k/74k/119 rows,
both approaches cost single-digit-to-low-double-digit milliseconds, and the
existing indexes already help. Apply consistently across `cards.ts`
(`title`, `text`), `decklists.ts` (`name`), and `rule-sections.ts` (`title`,
`bodyText`). No migration needed.

## Before state: current `%`-only implementation, measured

Single-word `EXPLAIN ANALYZE` runs against each table's real, current
production query (`WHERE ... %  ... ORDER BY similarity(...) LIMIT 30`), one
"direct" case (word is a plain substring of some row) and one "fuzzy" case
(one-character typo of that same word). Measured against the real synced
dataset (2054 cards / 74,242 decklists / 119 rule sections) on 2026-07-31.

| Table | Case | Query | Rows found | Correctness | Plan | Time |
|---|---|---|---|---|---|---|
| Card | direct `bioroid` | title/text | 2 of 8 titles actually containing "bioroid" | **Fail** — misses "Bioroid Efficiency Research", both "Trieste Model Bioroids", all 4 "Haas-Bioroid:" identities (diluted below 0.3) | Seq Scan | 27.7 ms |
| Card | fuzzy `eficiency` | title/text | 3 | Pass (found "Bioroid Efficiency Research" via `text` match) | Seq Scan | 24.6 ms |
| Decklist | direct `rush` | name (+ Card join) | 161 | Pass (reasonable recall) | Bitmap Index Scan on `Decklist_name_trgm_idx` | 28.5 ms |
| Decklist | fuzzy `rsh` | name | **0** | **Fail** — complete miss, no decklists with "rush" in the name surfaced at all | Bitmap Index Scan (found 966 candidates, all filtered out by `%` recheck) | 6.0 ms |
| RuleSection | direct `trash` | title/bodyText | 3 ("Trashing", "Trash Cost", "Traces") | Partial — "Traces" is a spurious trigram-overlap match, not a real "trash" hit | Seq Scan | 27.8 ms |
| RuleSection | fuzzy `trach` | title/bodyText | 1 ("Traces" only) | **Fail** — misses "Trashing" and "Trash Cost" (the sections a user typing "trach" is almost certainly looking for), keeps the spurious "Traces" match | Seq Scan | 23.8 ms |

Takeaways: execution time is uniformly cheap (6–29ms, all well within a web
request budget) even on the small/unindexed `Card`/`RuleSection` tables, so
performance is not a constraint on the fix. Correctness is the real problem
— 3 of 6 cases silently drop rows a user would reasonably expect (including
a **complete** miss on `rsh`→"rush"), and the rule-sections case shows the
flip side, a spurious match riding along due to incidental trigram overlap.

## After state, step 1: `word_similarity`/`<%` only

Implemented in `cards.ts`/`decklists.ts`/`rule-sections.ts` (filter changed
from `col % q` to `q <% col`; ranking from `similarity(col, q)` to
`word_similarity(q, col)`), then re-ran the identical six queries.

| Table | Case | Rows found | Δ vs before | Time | Δ vs before |
|---|---|---|---|---|---|
| Card | direct `bioroid` | 23 | +21 — now correctly includes "Bioroid Efficiency Research", all 4 Haas-Bioroid identities, "Trieste Model Bioroids" | 29.1 ms | +1.4 ms |
| Card | fuzzy `eficiency` | 3 | unchanged | 32.2 ms | +7.6 ms |
| Decklist | direct `rush` | 645 | +484 | 13.0 ms | **−15.5 ms** (planner switched to an index range condition, `%>`) |
| Decklist | fuzzy `rsh` | 0 | unchanged — **still a complete miss** | 1.7 ms | −4.3 ms |
| RuleSection | direct `trash` | 50 | +47 | 70.9 ms | +43.1 ms |
| RuleSection | fuzzy `trach` | 16 | +15 | 48.9 ms | +25.1 ms |

Two things this surfaced that the "Decision" section above didn't
anticipate:

1. **The `rsh`→"rush" fuzzy case is untouched by `word_similarity`.**
   `word_similarity('rsh', 'rush') = 0.2857`, still under the 0.6
   `word_similarity_threshold`. Root cause: dropping the middle letter
   ("ru**s**h" → "r**s**h") changes essentially all of the 3-character
   trigrams, so there's no real overlap left for *any* trigram-based
   method to find — this isn't a dilution problem, it's a genuine
   edit-distance case that trigram similarity (whole- or partial-string)
   isn't suited for.
2. **`RuleSection.bodyText` is prose, and this matters at scale.** Spot
   check: sections "General" (9.1/10.1) and "Ownership and Control" (1.14)
   both score `word_similarity('trash', "bodyText") = 1` — a literal,
   correct substring hit, just because "trash"/"trashing" is a common verb
   mentioned in passing across ~40% of the glossary. This isn't a bug (the
   substring genuinely appears), but it reveals a **ranking** gap: every
   section with a literal mention scores the same 1.0 ceiling, so
   `ORDER BY word_similarity(...)` can't distinguish "this section is
   about trashing" (2.6 "Trash Cost", 1.19 "Trashing") from "this section
   mentions trash once" (9.1 "General"). Out of scope for this change, but
   worth flagging for a future pass (e.g. weighting title matches above
   body matches, which the current `GREATEST(...)` collapses together).

## After state, step 2: `word_similarity` + `ILIKE` (implemented)

Added `col ILIKE '%q%'` (parameterized, not string-concatenated) alongside
`<%` in the same `OR` condition in all three files, per the Decision above.
Same six queries again:

| Table | Case | Rows found | Δ vs step 1 | Time | Δ vs step 1 |
|---|---|---|---|---|---|
| Card | direct `bioroid` | 23 | +0 | 31.4 ms | +2.3 ms |
| Card | fuzzy `eficiency` | 3 | +0 | 40.2 ms | +8.0 ms |
| Decklist | direct `rush` | 673 | +28 | 14.1 ms | +1.1 ms |
| Decklist | fuzzy `rsh` | 189 | **+189** | 5.6 ms | +3.9 ms |
| RuleSection | direct `trash` | 50 | +0 | 67.3 ms | −3.6 ms |
| RuleSection | fuzzy `trach` | 16 | +0 | 52.2 ms | −0.1 ms |

The `rush`/`bioroid`/`trash` deltas are real wins: `ILIKE` catches genuine
substrings that fall just under the 0.6 `word_similarity` threshold (e.g.
"Crushed Fingers", "Crushing Core", "Champ Crusher" — all literally contain
"rush" but didn't clear `<%`).

**The `rsh` jump from 0 to 189 isn't a "fix" for finding "Rush" decks, and
that's fine.** Checked directly: none of those 189 are "NBN Rush"-style
decks — `ILIKE '%rsh%'` matched names containing the literal 3-character
sequence "rsh" inside an unrelated word ("Aldershot", "Harsh Noise Deck",
"Ben Marsh"), since "rsh" is a real substring of those, just not of "rush"
(r-u-s-h has no contiguous "r-s-h" — dropping the middle letter changes
which substrings exist, not just how similar the strings are). This is a
genuine edit-distance typo, which no substring-based technique (`%`, `<%`,
or `ILIKE`) is designed to solve — expected, not a gap in this change.

What matters is whether these 189 incidental matches would ever crowd out a
*real* match in the ranked results, and checked directly, they don't: none
score above `word_similarity('rsh', name) = 0.5` (top scorers: "Harsh Noise
Deck," "TARSH.dec," Ben Marsh's decks at 0.5; "...Aldershot Regionals"
names down at 0.25–0.286), so `ORDER BY word_similarity(...) DESC` sinks
them below any stronger match, same as intended. Fixing the "rsh" → "rush"
typo itself would need a different technique entirely (e.g. edit-distance/
Levenshtein matching) — worth knowing it's out of scope, but not a defect
in what got built.

Performance across both steps stays in the same 1.7–71ms band already
established as a non-issue at this dataset's size (2054/74,242/119 rows);
the `RuleSection` direct/fuzzy cases are the slowest (~50–70ms) purely
because `word_similarity` against the long `bodyText` column is compared
via a full sequential scan (no GIN index benefit for `word_similarity`
itself, only for its indexable operators against short columns) — still
negligible for a local single-user app.

## Testing

The 36 existing Vitest cases in `cards.test.ts`/`decklists.test.ts`/
`rule-sections.test.ts` (real-DB tests, same pattern as Phase 4) already
pass unchanged against the new query shape — confirmed via `pnpm vitest run`
after the code change, before writing this section. They weren't written
against the specific gap this doc investigates, though, so the following
were added (all real-DB tests, same pattern as the existing ones; 59/59
green via `pnpm test` as of 2026-07-31, up from the original 36):

- **A single-word-substring-of-a-longer-field regression test**, one per
  module, pinned to the concrete cases measured above: `searchCards({ q:
  "bioroid" })` must include "Bioroid Efficiency Research" in its results;
  `searchDecklists({ q: "rush" })` must include a name where "rush" is a
  substring of a longer word (e.g. "Crushed Fingers"), not just a whole
  matching word; `searchRuleSections({ q: "trash" })` must include both
  "Trashing" (1.19) and "Trash Cost" (2.6). These are exactly the cases the
  old `%`-only implementation failed on this doc's "before" measurements —
  pinning them stops a future refactor from silently regressing back to
  whole-string-only matching. Done as written, with one wrinkle for
  decklists: q="rush" alone scores "Crushed Fingers" at only 0.4 (an
  ILIKE-only match, well under the 0.6 word_similarity threshold) against
  673 total matches, so it sorts past `MAX_PAGE_SIZE` (100) on relevance
  order alone — the test narrows with the existing `identity` filter (same
  pattern as the other identity-filter tests in that file) to bring it
  within a page, without asserting anything about its rank.
- **A ranking-order test** confirming a title-level match outranks a
  body/text-level incidental mention when both exist for the same query
  (guards the `GREATEST(word_similarity(title,...), word_similarity(text/
  bodyText,...))` ordering behavior, not just the filter). Added to
  `cards.test.ts` and `rule-sections.test.ts` (decklists has no title/body
  split, so `GREATEST` doesn't apply there). Finding a real, non-tied pair
  in production data took some digging because of the ceiling effect noted
  above: any *literal* substring match scores a flat 1.0 regardless of
  whether it's in the title or the text/body, so most naturally-occurring
  pairs tie instead of ranking. The tests use queries where the losing side
  is a genuinely fuzzy (non-literal) match instead: `searchCards({ q: "haas
  bioroid" })` — "Haas-Bioroid: Precision Design" (title match, 1.0)
  outranks "Sensor Net Activation" (text-only incidental mention, 0.615,
  confirmed via psql); `searchRuleSections({ q: "trash cost" })` —
  "Trash Cost" (2.6, title match, 1.0) outranks "Ownership and Control"
  (1.14, body-only incidental mention, 0.727).
- Extended the existing "a typo'd search still returns something
  reasonable" coverage in `cards.test.ts` with a case matching this doc's
  `eficiency`→"Efficiency" typo (single dropped letter, still within
  `word_similarity`'s reach): `searchCards({ q: "eficiency" })` must
  include "Bioroid Efficiency Research". Per the findings above, did
  **not** add a passing assertion for `rsh`→"Rush" in `decklists.test.ts`;
  that's a known, accepted gap, not a regression to guard against.
- While adding these, also fixed a stale test found in `decklists.test.ts`:
  "the name-search query plan uses the trigram GIN index" was still
  asserting on the pre-change `%`/`similarity()` query shape, which
  `searchDecklists()` no longer issues — so a regression in the *actual*
  current query path wouldn't have been caught by it. Updated the asserted
  SQL to the real `<%`/`ILIKE` shape; the index assertion itself
  (`Decklist_name_trgm_idx`, no seq scan) still holds, reconfirmed via a
  fresh `EXPLAIN`.

## Verification

Follows `PROJECT_PLAN.md`'s "Phase verification standards": typecheck/lint
clean, tests passing (`pnpm test` — 59/59 green as of 2026-07-31, up from
36/36 post-change; `npx tsc --noEmit` and `pnpm lint` both clean), no
schema/migration involved so no introspection needed here. Additions
specific to this change:

- **Real queries against the live synced dataset**, not just fixture data —
  done throughout this doc via direct `psql`/`EXPLAIN ANALYZE` against the
  real 2054/74,242/119-row tables, before and after each code change, with
  actual row output inspected (not just row *counts*) to catch cases like
  the "Traces"/"General" incidental matches that a count alone would hide.
- **`EXPLAIN` confirms the existing Phase 1 `pg_trgm` GIN indexes are still
  used**, not silently bypassed by the new operators — confirmed:
  `Decklist_name_trgm_idx` serves both the `<%`/`%>` word-similarity
  condition and the `ILIKE` condition (via `BitmapOr` when both are
  present), no new index required. Reconfirmed 2026-07-31 with a fresh
  `EXPLAIN` against the actual current query text (see the Testing section's
  note about the stale test that had drifted from it) — same `BitmapOr` over
  two `Decklist_name_trgm_idx` scans, no seq scan.
- **App layer, confirmed 2026-07-31** against a running `pnpm dev` (reused
  an already-running instance rather than starting a second one) via `curl`
  and inspecting the rendered HTML, not just raw SQL output:
  - `curl localhost:3000/cards?q=bioroid` → response body contains "Bioroid
    Efficiency Research".
  - `curl localhost:3000/cards?q=eficiency` → response body contains
    "Bioroid Efficiency Research" (the typo case).
  - `curl localhost:3000/decklists?q=rush` → top-ranked results are genuine
    whole-word "Rush" decklist names (e.g. "1st place UK Nationals 2016:
    CTM Tempo Rush"); confirmed separately with
    `q=rush&identity=pravdivost_consulting_political_solutions` that
    "Crushed Fingers" (the substring-only match, ranked too low to appear
    on relevance order alone) is reachable through the real route.
  - `curl localhost:3000/rules?q=trash` → response body contains both
    "Trashing" and "Trash Cost".
  - `curl localhost:3000/decklists?q=rsh` → top results are "Ben Marsh",
    "Harsh Noise Deck", "TARSH.dec" — confirms the documented gap
    (no "Rush"-named decks surfaced) holds at the app layer too, not just
    in the raw SQL this doc measured earlier.
  All five match the direct-`psql` behavior recorded above; the Next.js
  layer isn't doing anything to the query shape that changes these results.
- **Known, accepted gaps to sign off on, not silently forget** (per the
  findings above): `RuleSection`/`Card.text` ranking doesn't distinguish a
  topical match from an incidental one-off mention (both hit the same 1.0
  `word_similarity` ceiling); dropped-letter typos (`rsh`→"rush") aren't
  found by any of `%`/`<%`/`ILIKE`. Neither blocks this change — both are
  explicitly deferred, not accidentally missed.

## Re-verification protocol (for future reruns of this check)

The Testing/Verification passes above were an *investigation* — deriving
and justifying the design decision from scratch, which legitimately needed
verbose `EXPLAIN ANALYZE` trees and full row dumps at every step to catch
things like the "Traces"/"General" incidental matches. That reasoning is
now permanently on record in this doc. A future rerun (e.g. confirming
nothing regressed after an unrelated change) is a *confirmation*, not a
re-investigation, and should be run leaner. Rules for that:

1. **The pinned Vitest suite is the primary source of truth, not raw SQL.**
   The six correctness cases from the investigation (bioroid substring,
   rush substring, trash/trashing dual-match, the eficiency typo, both
   ranking-order cases, and the absence of an `rsh`→"rush" assertion) are
   now permanently encoded in `cards.test.ts`/`decklists.test.ts`/
   `rule-sections.test.ts`. A green `pnpm test` run *is* the evidence for
   all of them — don't re-derive them via `psql` unless a test actually
   fails and root-causing the failure requires dropping to raw SQL.
2. **Don't re-run the full historical before/step-1/step-2 comparison
   matrix.** That 18-query matrix (six cases × three implementation states)
   was what justified *choosing* `word_similarity` + `ILIKE` over `%`
   alone; the decision is made and recorded above. Re-deriving it on every
   check is redundant unless the matching logic itself changes again.
3. **When raw SQL genuinely is needed** (a test fails and the failure isn't
   self-explanatory), prefer compact forms over the verbose ones used
   during the investigation:
   - `psql -tA` (tuples-only, unaligned) instead of default aligned output
     — strips box-drawing borders, column padding, and the row-count
     footer, which dominate the size of a typical result dump.
   - A single boolean/aggregate assertion (`SELECT bool_or(title = 'X')
     FROM ...`) instead of `SELECT title FROM ... ORDER BY ...` dumping
     every matching row — only fall back to a full row listing if the
     boolean check itself fails and you need to see what actually matched.
   - For plan/index confirmation, grep the `EXPLAIN` output for the one or
     two lines that matter (`grep -E "Scan|Execution Time"`) instead of
     printing the full plan tree — the investigation's conclusion (GIN
     index used, no seq scan on the indexed tables) only needs
     reconfirming if the query's `WHERE`/`ORDER BY` shape actually changed.
4. **App-layer confirmation via `grep`, not a full HTML dump.** `curl -s
   ... | grep -c "Bioroid Efficiency Research"` (expect a non-zero count)
   gives the same evidence as reading the rendered page, at a fraction of
   the size.
5. **Chain typecheck/lint/test into one command** (e.g. `npx tsc --noEmit
   && pnpm lint && pnpm test`) so it's one tool call with pass/fail output,
   not three separate verbose invocations. If it fails, rerun the failing
   step alone for detail.
6. **Default/quiet reporters everywhere** — Vitest's default reporter and
   plain `pnpm lint` are already concise; don't opt into `--reporter=verbose`
   or equivalent unless actively debugging a failure.

Applying all of the above, a full reconfirmation (tests + typecheck + lint
+ app-layer spot checks) should be a handful of tool calls with compact
output, not the dozens of verbose `EXPLAIN ANALYZE`/row-dump calls the
original investigation required — while still exercising the same real
code paths (real DB, real Next.js routes) the original verification did,
so it isn't a quality downgrade, just a leaner way to reconfirm an
already-established result.
