# Decklist Quick-View Tabs — Current-State Bug Research (a: Recent vs. Recently Updated, b: missing Popular/Tournaments/Hall of Fame)

Companion to, and builds on top of (does not replace), `agent-reports/decklist-search-quickviews-research.md`
(the vetted research pass) and `plans/PHASE_8_PLAN.md` / `agent-reports/phase-8.md` (the plan and build
report that implemented it). This report investigates two user-reported issues against what is actually
implemented and actually running **today** (2026-08-10), not against what any prior report assumed or
recommended.

Source tags: **[code-read]** = read directly from a file in this repo, cited by path:line; **[db-verified]**
= a real query run this session against the live Docker Postgres instance (`docker compose exec postgres
psql`); **[http-verified]** = a real `curl` against the live `pnpm dev` server on `localhost:3000`, running
already at session start; **[git-verified]** = `git log`/`grep` run directly against this repo's history.
No claim below is unconfirmed/inferred — everything is one of the above.

---

## 0. Was the schema promotion from the research report actually done?

Yes, in full, and correctly. **[code-read]**:

- `prisma/schema.prisma:88-115` — `Decklist` has real, indexed `createdAt DateTime?`, `updatedAt DateTime?`,
  and `nrdbUserId String?` columns (not JSONB-only), with `@@index([createdAt])` and `@@index([updatedAt])`,
  plus a header comment explicitly citing this as "Promoted out of `raw` in Phase 8 (PHASE_8_PLAN.md item 1)."
- `prisma/migrations/20260808194730_add_decklist_date_and_author_columns/migration.sql` — pure `ADD COLUMN`
  + two `CREATE INDEX`, no drops.
- `src/sync/sync-decklists.ts:41-60` (`mapDecklist()`) — maps `attributes.created_at`/`updated_at`/`user_id`
  into the three new columns on every sync (`createdAt: attributes.created_at ? new Date(...) : null`, etc.),
  so future incremental syncs keep them current, not just a one-time backfill.

**[db-verified]**, live confirmation the backfill actually landed and stayed populated:
```
SELECT count(*) FROM "Decklist";                         → 74242
SELECT count(*) FROM "Decklist" WHERE "createdAt" IS NULL; → 0
SELECT count(*) FROM "Decklist" WHERE "updatedAt" IS NULL; → 0
```
So the research report's §5/Recommendation-(c) schema gap is fully closed — this is not the source of
either reported problem. `74242` also directly matches the original research's "~74k" citation and
`sync-decklists.ts:5-6`'s own comment ("NRDB has ~74k decklists... verified live via `meta.stats.total.count`"),
confirming jinteki's synced total is already "similar to NetrunnerDB" in the sense the task asked about.

---

## (a) "Recent" and "Recently Updated" appear to show the same decklists

### The queries are genuinely different — no aliasing, no no-op filter, no UI highlight bug

**[code-read]**, `src/lib/search/decklists.ts:106-138`:
```ts
const orderColumn = tab === "updated" ? Prisma.sql`"updatedAt"` : Prisma.sql`"createdAt"`;
const orderSql = Prisma.sql`ORDER BY d.${orderColumn} DESC NULLS LAST, d.id ASC`;
```
`recent` sorts by `createdAt`, `updated` sorts by `updatedAt` — two real, distinct SQL `ORDER BY` clauses,
not the same column twice. Neither tab has a `WHERE` clause narrowing the set (only `week` does, via
`WHERE d."createdAt" >= now() - interval '7 days'`, line 108) — so **both `recent` and `updated` intentionally
return the entire 74242-row table**, just reordered. This is by design, not a bug: it mirrors NRDB's own
Recent tab, which the original research confirmed (§2) is "strict newest-first ordering... no date-range
grouping" over the whole corpus, not a filtered subset.

**[code-read]**, `src/app/decklists/page.tsx:96-109` — tab-link active-state markup:
```tsx
aria-current={tab === t.value ? "true" : undefined}
className={tab === t.value ? "font-semibold underline" : "text-zinc-500 underline ..."}
```
`tab` comes from `parseDecklistTab(rawParams)` (`src/lib/search/decklists.ts:41-45`), a plain lookup against
the requested `?tab=` value with a fallback to `"recent"` for anything unrecognized. **[http-verified]**:
fetching `/decklists` shows `aria-current="true" ... href="/decklists">Recent` and no other tab marked
active; fetching `/decklists?tab=updated` shows the same pattern shifted to "Recently updated" only. **Only
one tab is ever highlighted as active at a time** — there is no UI bug where both tabs show as selected
simultaneously.

**Conclusion on the "is it actually two queries" question**: yes, unambiguously. There is no aliasing, no
always-true/no-op filter, and no highlight bug. What follows is a data-characteristic problem, not a
query-construction bug.

### The counts are identical — and that's correct, not the bug

**[http-verified]**: both `/decklists` and `/decklists?tab=updated` render `74242` as the total (grepped
`74242` directly out of both rendered HTML/RSC payloads). This matches **[db-verified]** `SELECT count(*)
FROM "Decklist"` → `74242` exactly. Since neither tab filters, both correctly show the full corpus — this
satisfies the user's "count should be similar to NetrunnerDB" expectation already (~74k on both sides,
per `sync-decklists.ts:5-6`'s own comment about NRDB's real total). **The count being identical between
the two tabs is expected and correct, not evidence of a bug.**

### What actually reproduces the user's complaint: near-total row-level overlap on every page a user would realistically browse

This is the real finding. **[db-verified]**, direct set-overlap checks between the two tabs' actual
`ORDER BY` results:

| Window | `createdAt DESC` top-N | `updatedAt DESC` top-N | Overlap |
|---|---|---|---|
| Top 30 (page 1 @ 30/page) | 30 | 30 | **30/30 (100%)** |
| Top 100 | 100 | 100 | **99/100** |
| Top 1000 (~page 33) | 1000 | 1000 | **993/1000** |
| Offset 300, next 30 (~page 11) | 30 | 30 | **28/30** |

**[http-verified]** cross-check against the live server (not just `psql`): the first 10 `href="/decklists/<id>"`
links returned by `curl http://localhost:3000/decklists` and `curl http://localhost:3000/decklists?tab=updated`
are **the same 10 decklist ids**, only lightly reordered (positions 3–5 and 10 swap) — this is the literal
symptom the user is describing, reproduced against the running app, not just the database.

**Root cause, [db-verified]**: NRDB's own `updated_at` field — synced verbatim, not computed by jinteki
(`sync-decklists.ts:56`) — is clustered almost entirely onto two calendar days:
```
SELECT date_trunc('day', "updatedAt") AS day, count(*) FROM "Decklist"
WHERE "updatedAt" >= '2026-06-01' AND "updatedAt" < '2026-07-01'
GROUP BY day ORDER BY count(*) DESC LIMIT 3;
```
→ `2026-06-07`: 59768 rows, `2026-06-08`: 12746 rows — **72514 of 74242 rows (97.7% of the entire table)**
have `updatedAt` inside a single 2-day window, almost certainly a one-time bulk re-touch/reindex event on
NRDB's own backend (unrelated to any real per-deck edit — decklist content this old wouldn't plausibly all
be "edited" in the same 48 hours). This is **not a jinteki sync artifact**: jinteki's own Phase 2 initial
sync ran in late July 2026 per `agent-reports/phase-2.md`, weeks after this June 7–8 window, and
`updatedAt` is a plain field copied from NRDB's API response (`sync-decklists.ts:56`), never a Prisma
`@updatedAt` auto-timestamp (confirmed by `prisma/schema.prisma:101-102` declaring it a plain nullable
`DateTime?`, not `@updatedAt`) — jinteki cannot be setting this value itself.

The remaining **884 decklists** (**[db-verified]**, `createdAt >= '2026-06-08 12:00:00'`) were created after
that bulk-touch window, and their `updatedAt` sits a short, consistent interval after their `createdAt`
(observed pattern: rounded up to the next hour + ~3 minutes, e.g. `createdAt` `2026-07-28 15:20:34` →
`updatedAt` `2026-07-28 16:03:06` — **[db-verified]**), which reads as routine NRDB post-creation processing
lag, not a real edit either. Because these 884 rows' `updatedAt` values are the only ones newer than the
June 7–8 bulk-touch date shared by the other 97.7%, sorting `DESC` by `updatedAt` necessarily surfaces
**the same recently-created decks** at the top as sorting by `createdAt` does — hence the near-total overlap
on every page a real user would look at. Divergence only starts once a user pages past roughly the ~884–900
most-recently-created decks (~page 30 at 30/page), where "Recently updated" then drops into the massive,
functionally-untied 97.7% cluster (ordered only by the `id ASC` tie-break within it) while "Recent" continues
its meaningful descent through actual creation history.

**Characterizing "how far off," concretely, per the task's request**: this is not "all 74k decklists show
under both tabs with no filtering at all" (both tabs are correctly unfiltered by design, matching NRDB) —
it's that **the specific rows visible on the first ~30 pages are ~97–100% identical in membership** between
the two tabs, because `updated_at` (as synced verbatim from NRDB) fails to encode a meaningfully different
signal from `created_at` for the vast majority of the dataset. The "Recently updated" tab is technically
correct and genuinely a second query, but is currently close to indistinguishable from "Recent" in practice
because of this real, NRDB-side data characteristic — not because of any bug in `decklists.ts` or
`page.tsx`.

### Was this knowable at Phase 8 build time?

**[code-read]**, `agent-reports/phase-8.md:134-138` — the Phase 8 build's own tests verified "Recent/Updated
ordering correctness" (each query internally sorts correctly by its own column) but never checked whether
the two tabs' *result sets* were distinguishable from each other in practice — i.e., it verified mechanical
correctness of each query in isolation, not the "does this actually look different to a user" property the
research report's §4 item 2 implicitly assumed ("a deck actively being revised surfaces here even if posted
years ago — a genuinely different, genuinely honest signal from Recent"). That assumption is true in
principle (the columns are semantically different) but turned out false in practice for this dataset, and
nothing in the build's verification checklist would have caught it. This is a real gap in the original
research/plan/verification chain, not negligence in any one step — flagged here as new information.

---

## (b) Why does the user expect Popular / Tournaments / Hall of Fame to exist?

### These were explicitly, deliberately, and repeatedly decided against — twice, independently

**[code-read]**, two separate research passes reached the identical conclusion via independent evidence
gathering:
- `agent-reports/netrunnerdb-ux-research.md:359-362` — the earlier pass: "jinteki has no engagement-signal
  data... Not worth building a fake 'popular' ranking with no real signal behind it."
- `agent-reports/decklist-search-quickviews-research.md` §3/§4/Recommendation(b) (the report this task
  told you to read first) — re-opened the question specifically to check the first pass wasn't just
  assuming this, directly fetched the real NRDB v3 API three separate times, and confirmed the public
  decklist resource has **zero** engagement/curation fields and the API docs list no such resource at all.
  Verdict: **drop** Popular, Hall of Fame, Hot Topics, Tournaments; build Recent/Recently-updated/Favorited-
  by-jinteki-users/Posted-this-week instead.

**[code-read]**, `plans/PHASE_8_PLAN.md:18-39` ("Divergence from the literal request, and why") explicitly
documents that the task which produced this plan **did** ask for "all the same quick options for decklists
('popular', 'recent', etc.)" — i.e., someone did once ask for this — and explicitly overrode that ask,
citing the research's evidence, choosing not to build Popular/Hall of Fame/Hot Topics/Tournaments. This is
stated as a deliberate scope decision, flagged to the repo owner in the task report, not an oversight.

**[code-read]**, `agent-reports/phase-8.md:1-8` (the build's own report) confirms this was actually followed
through, not just planned: "Popular / Hall of Fame / Hot Topics / Tournaments were **not** built... per the
plan's Divergence section. No scope was added beyond the plan."

**[code-read]**, `src/lib/search/decklists.ts:30-37` — the live `DECKLIST_TABS` array has exactly four
entries: `recent`, `updated`, `week`, `favorited`. No trace of the other four anywhere in the type or UI.

**[code-read]**, `src/lib/search/decklists.test.ts:34-38` — a test explicitly enumerates the excluded tabs
by name and asserts they gracefully no-op to `"recent"` rather than erroring:
```ts
it("falls back to 'recent' for an unrecognized value", () => {
  expect(parseDecklistTab({ tab: "popular" })).toBe("recent");
  expect(parseDecklistTab({ tab: "hottopics" })).toBe("recent");
  expect(parseDecklistTab({ tab: "halloffame" })).toBe("recent");
});
```
This is evidence the exclusion was deliberate and specifically considered (someone wrote a test naming
exactly these three tabs), not evidence of a half-built feature — there is no dead code, no commented-out
tab entry, no partially-wired route for any of them.

### No regression, no gap between plan and build, no stale promise found anywhere

**[git-verified]**: `git log --oneline --all | grep -iE "popular|tournament|hall of fame|hot topic"` →
**zero matches**. No commit in this repo's history has ever added, attempted, or reverted work on any of
these tabs. `git log --oneline --all -- src/app/decklists src/lib/search/decklists.ts` shows only three
commits ever touched this area (`3099159` phase 6, `3dcaa01`/`ab5da80` phase 8) — the phase 8 commits are
exactly the ones that built the four tabs that do exist. There is no partially-reverted work to find.

**[code-read]**: `grep -rniE "popular|hall of fame|hot topic|tournaments? tab" plans/ agent-reports/` finds
these terms **only** inside the two research reports (both recommending drop) and the Phase 8 plan/report
(both documenting the drop was followed through), plus one unrelated hit in `PROJECT_PLAN.md:12` ("no
pre-filtering by quality/popularity" — about sync scope, not UI tabs) and one in
`format-descriptions-links-and-search-plan.md` ("tournament-legal" in an unrelated context about format
descriptions). No mockup, no separate roadmap doc, no stale comment anywhere promises these tabs.

### Which of the three explanations this is

Per the task's framing: this is **explanation (3)** — the user's expectation doesn't match any actual
internal jinteki plan. It is, however, a **well-founded** expectation in the sense that both research
reports independently and directly confirmed real `netrunnerdb.com` has exactly these tabs
(`netrunnerdb-ux-research.md:205-211`, `decklist-search-quickviews-research.md` §2, both citing real fetched
URLs/titles). The user is almost certainly recalling NetrunnerDB's actual site correctly — they are just
unaware that jinteki's own research explicitly investigated whether these could be honestly replicated and
concluded no backing data exists for them via the public API jinteki syncs from, and that this conclusion
was deliberately built into Phase 8 rather than silently dropped. This is not a bug and not a plan/build gap
— it's a scope/tradeoff conversation to have with the user, reconciled explicitly below.

---

## Recommendations

### (a) Recent / Recently Updated

**Not a code bug — no fix is needed to the query logic itself.** The two tabs are genuinely different
queries, correctly implemented, matching `PHASE_8_PLAN.md`'s spec exactly. The practical near-duplication is
a real, reproducible consequence of NRDB's own `updated_at` data (a one-time bulk touch covering 97.7% of
the corpus on 2026-06-07/08) rather than a defect in `decklists.ts` or `page.tsx`. Three options, in order
of increasing scope, for the repo owner to choose among — this report does not pick one:

1. **Leave the query as-is; add explanatory copy.** Cheapest option: a one-line hint under the "Recently
   updated" tab (e.g. "Reflects NetrunnerDB's own last-modified timestamp, which may not always indicate a
   meaningful edit") so the near-duplication with Recent is understood rather than read as broken. No query
   change.
2. **Narrow "Recently updated" to decks with a *meaningful* edit gap.** Add a `WHERE "updatedAt" -
   "createdAt" > interval 'X'` condition (threshold TBD) to exclude the bulk-touch noise and the routine
   post-creation processing lag, making the tab surface only decks plausibly revised well after posting —
   closer to the original research's intended "actively being revised" signal (`decklist-search-quickviews-research.md`
   §4 item 2). This changes the tab from a pure sort into a sort+filter, a real scope change beyond what
   Phase 8 shipped; needs an explicit decision on the threshold and repo-owner sign-off before building.
3. **Drop "Recently updated" as a distinct tab.** Since it was already flagged in the original research as
   "optional... free to add if a Recent view is being built anyway" (§4 item 2, not one of the required
   tabs), and it currently delivers little practical distinction from Recent, removing it is a legitimate
   option rather than fixing it — consistent with this project's stated preference (`RESEARCH_AND_VERIFICATION_PRINCIPLES.md`)
   for not shipping a feature that reads as broken by visual association.

Whichever is chosen, also worth noting: the "Posted this week" tab is correctly showing 0 results right
now (**[db-verified]** no decklist has `createdAt` in the last 7 days — the newest synced decklist is from
2026-07-28, 13 days before this session's date) — this is a sync-freshness observation, not a bug in the
tab's own `WHERE` clause, and is out of scope for this report but worth the repo owner's awareness if a
fresh sync run is due.

### (b) Popular / Tournaments / Hall of Fame

**Recommend keeping the drop decision** — nothing has changed since the original research: no new NRDB
API surface has appeared, and the two independent research passes' direct evidence (zero engagement fields
on the public v3 decklist resource, confirmed three separate times; API docs listing no such resource at
all) is not something a jinteki-side code change could work around. Reconciling explicitly against
`decklist-search-quickviews-research.md`'s Recommendation (b) table: this report finds no new information
that would overturn "Popular/Hall of Fame/Hot Topics/Tournaments: Drop" for any of the four tabs — that
verdict was reached, vetted (per `PHASE_8_PLAN.md:8-10`'s own note that the load-bearing claims were
independently re-fetched and matched before the plan was written), and then actually built as specified,
confirmed live in this session.

If the user still wants something in this space after understanding the tradeoff, the honest options
already exist or are already scoped, and don't require re-opening the "fake NRDB's engagement data"
question:
- **"Favorited by jinteki users"** already ships (`src/lib/search/decklists.ts:76-104`, the `favorited` tab)
  as the honest, differently-labeled alternative to Popular — real data, jinteki's own scale, not NRDB's.
  It's correctly showing its empty state right now (**[http-verified]**, **[db-verified]** 0 rows in
  `DecklistFavorite`), which is expected, not broken.
- If the user specifically wants NRDB's *real* Popular/Tournaments/Hall-of-Fame rankings (not a jinteki-native
  proxy), that would require either scraping NRDB's own private web UI (both research reports flag this as
  fragile and likely against NRDB's ToS) or waiting for jinteki's own favoriting feature to reach comparable
  engagement density (assessed as unlikely soon, given jinteki's user base vs. NRDB's ~74k-decklist scale).
  Neither is a small follow-up — surfacing this tradeoff to the user directly is the resolution here, not a
  bug fix.

---

## Files referenced

- `prisma/schema.prisma:88-115`
- `prisma/migrations/20260808194730_add_decklist_date_and_author_columns/migration.sql`
- `src/sync/sync-decklists.ts:1-60`
- `src/lib/search/decklists.ts` (whole file, 139 lines)
- `src/lib/search/decklists.test.ts:23-39`
- `src/app/decklists/page.tsx` (whole file, 155 lines)
- `plans/PHASE_8_PLAN.md:1-39` (Context, Divergence section)
- `agent-reports/phase-8.md:1-8, 134-138`
- `agent-reports/decklist-search-quickviews-research.md` (whole report, this task's required background)
- `agent-reports/netrunnerdb-ux-research.md:205-211, 359-362`
- `agent-reports/phase-2.md:14` (sync timeline cross-check)
- `plans/PROJECT_PLAN.md:12`

## Verification commands actually run this session

- `docker compose exec postgres psql -U jinteki -d jinteki` — multiple direct queries: total row count,
  null-column checks, `createdAt`/`updatedAt` delta distribution, top-N/offset-N overlap sets between the
  two `ORDER BY` clauses, monthly/daily `updatedAt` histogram isolating the June 7–8 2026 bulk-touch window.
- `curl http://localhost:3000/decklists`, `?tab=updated`, `?tab=week`, `?tab=favorited` against the
  already-running `pnpm dev` server — compared rendered decklist ids, active-tab markup, total counts, and
  empty-state copy directly against the `psql` findings above.
- `git log --oneline --all` / `grep -rniE` across `plans/`, `agent-reports/`, and `src/` for any trace of
  Popular/Tournaments/Hall of Fame/Hot Topics work, past or present.

No code changes were made — investigation only, per the task instructions.
