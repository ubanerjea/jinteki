# Decklist Advanced Search & Quick-View Tabs — Research (re-opening the "no engagement data" question)

## 0. Purpose and framing

`agent-reports/netrunnerdb-ux-research.md` §6/§8 already surveyed NRDB's decklist browsing UI once
and concluded jinteki should skip Popular/Hot Topics/Decklist-of-the-Week/Hall-of-Fame/Tournament
tabs because "jinteki has no engagement-signal data... not worth building a fake popular ranking
with no real signal behind it." That conclusion was reached without directly fetching a real NRDB
**API** decklist resource or the API docs index — this pass does both, plus fetches the real
advanced-search form's field list via a real query-string example, to settle the question with
primary evidence rather than inference. **Short answer, argued in full below: the earlier
conclusion holds, and now rests on direct evidence instead of an assumption.** The public v3 API
decklist resource has zero engagement fields, zero engagement-based filter/sort endpoints, and the
docs index confirms no such resource is documented anywhere for decklists. One tab ("Recent") is
fully buildable from data jinteki already has. The rest should be dropped, not faked — see §4 and
the Recommendation.

Source tags used throughout: **[API-fetched]** = a real JSON response from `api.netrunnerdb.com`
fetched directly this session; **[docs-fetched]** = real content read from
`api.netrunnerdb.com/api/docs` or `api-preview.netrunnerdb.com/api/docs/...` this session;
**[mirror-fetched]** = read directly from the community mirror `nrdb.reteki.fun` (same open-source
codebase as netrunnerdb.com, different card pool — UI chrome/field-list claims transfer, decklist
*content* does not, same caveat the prior research used); **[websearch-corroborated]** = a
`WebSearch` snippet that quotes or shows a real `netrunnerdb.com` URL/page directly (not the
mirror); **[jinteki source]** = read from this repo. Direct `WebFetch` against `netrunnerdb.com`
itself (not `api.netrunnerdb.com`) returned HTTP 403 on every attempt this session, same
Cloudflare-style block the prior research hit — the API host and API docs host were not blocked and
are the primary source for the decisive claims below.

---

## 1. NRDB's real decklist advanced search form

**[websearch-corroborated] — decisive evidence: a real, literally-quoted `netrunnerdb.com` search
URL**, surfaced twice independently via `WebSearch`:

```
https://netrunnerdb.com/en/decklists/find?author=&faction=&mwl_id=&packs%5B%5D=1&packs%5B%5D=2&
  packs%5B%5D=28&packs%5B%5D=35&packs%5B%5D=7&packs%5B%5D=8&packs%5B%5D=9&sort=popularity&title=
```
```
https://netrunnerdb.com/en/decklists/find?cards%5B0%5D=22036
```

This is the actual results endpoint (`/en/decklists/find`) for the actual form
(`/en/decklists/search`), and it directly names real field/param identifiers: `author`, `faction`,
`mwl_id`, `packs[]` (repeatable — six values shown at once), `sort` (`popularity` confirmed as a
real value), `title`, `cards[N]` (repeatable, indexed).

**[mirror-fetched]**, from the mirror's `/en/decklists/search` (same open-source form, corroborates
and fills gaps in the URL evidence above with labels/types the bare query string doesn't show):

| Field | Type | Options / notes |
|---|---|---|
| Decklist name | text input | → `title=` |
| Author | text input | → `author=` |
| Side/Faction | multi-select | Corp: Haas-Bioroid, Jinteki, NBN, Weyland; Runner: Anarch, Criminal, Shaper, Adam, Apex, Sunny Lebeau, Mako → `faction=` |
| Rotation | select | "Ignore" / "First Rotation" |
| Tournament Legal | select | "Ignore" / "Yes" / "No" |
| Most Wanted List | select | "Ignore" / "No MWL" (i.e. filters by which MWL/restriction, if any, the deck predates or is clean under) → `mwl_id=` |
| Cards used | card picker | → `cards[]=` (confirmed by the real URL above) |
| Packs | multi-select checkboxes, 35+ packs, all/none toggle | → `packs[]=` (confirmed real, repeatable) |
| Sort | radio buttons | **Popularity** / **by Date** / **by Number of Likes** / **by Reputation of Author** (`sort=popularity` confirmed real) |

A "cards excluded" filter is also **[docs-fetched]**-confirmed to exist as a distinct API endpoint
(`Filter - Get decklists excluding all supplied Card ids`, §3 below) even though it wasn't directly
observed as a labeled form field — very likely present on the real form as a second card picker
alongside "Cards used," following the same pair the API docs list. Flagged as **unconfirmed exact
form label**, but the underlying filter capability is confirmed real.

**Sort options, cross-referenced with §3**: three of the four radio options (Popularity, Number of
Likes, Reputation of Author) are engagement-driven and — per §3's direct API evidence — **have no
underlying public-API field to compute them from**. Only "by Date" maps to a field jinteki actually
has (`created_at`/`updated_at`). This is the same fork the quick-view tabs hit, showing up again
inside the form itself, not just as separate tabs.

**Field list jinteki's own advanced decklist search should match structurally** (deferring the
engagement-only sort radios, per §4's recommendation): title, author (inert-text field only, per
the existing detail-page pattern — see §5), faction, side, packs (multi), cards-used, cards-excluded,
rotation/format-legality (jinteki's `Format`/`Restriction` models from Phase 6 are the direct
equivalent of NRDB's `mwl_id` filter — **[jinteki source]**, `prisma/schema.prisma` lines 263–301),
and a Date sort. This is consistent in shape with `plans/ADVANCED_CARD_SEARCH_PLAN.md`'s pattern —
one criterion per row, repeatable facets as multi-value params, a single explicit `order`/`sort`
param, its own `/decklists/advanced` + `/decklists/advanced/results` route split if the row count
ends up similarly tall.

---

## 2. The quick-view tabs

**[websearch-corroborated]**, tab list and real URLs confirmed via two independent `WebSearch`
result sets that returned actual `netrunnerdb.com` page titles and paths:

| Tab | Real URL | Title tag seen |
|---|---|---|
| Popular | `netrunnerdb.com/en/decklists` | "Popular Decklists · NetrunnerDB" |
| Recent | `netrunnerdb.com/en/decklists/recent` | "Recent Decklists · NetrunnerDB" |
| Decklist of the week | `netrunnerdb.com/en/decklists/dotw` | "Decklist of the week · NetrunnerDB" |
| Tournaments | `netrunnerdb.com/en/decklists/tournament` (paginated: `/tournament/2` seen) | "Tournaments · NetrunnerDB" |
| Hot topics | `netrunnerdb.com/en/decklists/hottopics` (paginated: `/hottopics/9` seen) | "Hot Topics · NetrunnerDB" |
| Hall of Fame | `netrunnerdb.com/en/decklists/halloffame` | "Hall of Fame · NetrunnerDB" |
| Search | `netrunnerdb.com/en/decklists/search` (form) / `.../find` (results) | "Decklist Search" / "Decklist search results" |
| *(out of scope)* My favorites | `netrunnerdb.com/en/decklists/favorites` | — |
| *(out of scope)* My decklists | `netrunnerdb.com/en/decklists/mine` | — |

Per-tab detail, **[mirror-fetched]** unless noted (mirror is the same codebase running against the
fan "Reboot" card pool — tab *mechanics* transfer, the specific decklists shown do not):

- **Popular** (the default `/en/decklists` view) — sorts by the site's own popularity metric.
  Every row on every tab shows **three unlabeled numeric columns**, consistently observed across
  Recent/Hot-Topics/Hall-of-Fame/Decklist-of-the-Week fetches this session (e.g. "1 0 0", "3 0 1",
  "2 0 4") — almost certainly likes/comments/favorites, matching one Hall of Fame row where these
  were explicit: **"Likes: 12, Comments: 3, Favorites: 1."** Author username (linked, with a
  numeric "reputation" score next to it) and post date are also shown per row on every tab.
- **Recent** — confirmed strict newest-first ordering by post date, no date-range grouping, no
  "N days ago" relative labels, just calendar dates. This is the one tab whose sort key
  (`created_at` descending) is a plain, unambiguous timestamp field.
- **Decklist of the week** — despite the singular name, renders as a **list**, not one featured
  deck, spanning years of history with pagination — i.e. it's a rolling "one per week, indefinitely
  archived" list, not a single homepage-style spotlight. No explanatory text on the page about
  selection criteria was found. **[websearch-corroborated]** independently confirmed the tab is
  real and titled exactly "Decklist of the week."
  A tournament-flavored entry appeared inline in this list too ("Winter Champs 2025" in a title),
  suggesting no hard separation between "tournament" and "of the week" categorization.
- **Tournaments** — mirror fetch returned only chrome (no rows loaded in the fetched excerpt), but
  **[websearch-corroborated]** directly: real tournament decklist titles are self-reported placement
  strings baked into the **decklist name itself** by the author at publish time — e.g. *"Netrunner is
  a game we play with our bodies [Worlds2024 1st]"*, *"I don't like this deck - 1st at Worlds 2020"*,
  a deck marked *"[1st and 3rd @Americas MC, 1st @Conts]"* with a 👑 badge. This is strong evidence
  the "Tournaments" tab is driven by a **structured flag/category set at publish time on NRDB's own
  site** (likely a checkbox/dropdown in NRDB's deck-editor, not just string-matching the title) —
  but whatever that flag is, it is **not one of the fields present on the public API decklist
  resource** (§3 confirms the full attribute list directly, three times, with none matching). The
  human-readable placement text living inside `name` is the only trace of "this was a tournament
  deck" that syncs to jinteki today, and it's freeform prose, not a structured, filterable field.
- **Hot topics** — mirror rows showed the same three-number format, with entries spanning back to
  2022, i.e. "hot" is not a strict recency window — it reads as an engagement-velocity ranking
  (comments/likes over some recent window), which by definition needs live vote/comment timestamps
  jinteki does not have.
- **Hall of Fame** — no explanatory criteria text found on the page; the one fully-visible row
  (12 likes, 3 comments, 1 favorite, from 2023) suggests a long-tenure, high-all-time-engagement
  bar, consistent with the name, but the exact threshold/algorithm is not published anywhere found
  this session.

"My decklists" and "My favorites" are explicitly out of scope per the task and not researched
further here.

---

## 3. The key question: does the real v3 public API expose the underlying signal? — No.

This is the load-bearing finding of the report, so it's backed by three independent, direct
fetches rather than one.

**[API-fetched]**, `GET https://api.netrunnerdb.com/api/v3/public/decklists?page[size]=1`, a real
decklist (`346b4f52-4e1b-4618-9b65-2010836854ed`, "Rich Turtle no more forever"). Complete
attribute list:

```
user_id, follows_basic_deckbuilding_rules, identity_card_id, name, notes, tags,
side_id, created_at, updated_at, faction_id, card_slots, num_cards, influence_spent
```

**[API-fetched]**, a second fetch, `GET .../decklists?page[size]=10&sort=-created_at`, ten more
real, distinct decklists (including three from *today*, 2026-08-08) — same attribute set on every
row, `tags` `null` on all ten. Confirms the first fetch wasn't a fluke and that `tags` is
essentially never populated in practice (see below).

**[API-fetched]**, two more single-decklist fetches via the documented identity/card-id filter
endpoints (§ below) — same attribute set again, no additional fields appear under different filter
paths.

**None of these three independent fetches contain anything resembling a like count, vote count,
favorite count, comment count, popularity score, tournament placement/result, "featured"/"decklist
of the week" flag, or any other engagement or curation signal.** This is a direct, repeated,
positive absence — not a failure to find a field, but confirmation the field genuinely is not
there.

**Two fields exist on the real resource that jinteki's current `DecklistAttributes`
(`src/lib/nrdb/types.ts`) doesn't type but the `[key: string]: unknown` index signature already
tolerates**, both harmless and neither an engagement signal: `follows_basic_deckbuilding_rules`
(boolean — a basic legality/well-formedness check, not popularity) and `tags` (a nullable array of
user-defined free-text strings — **[websearch-corroborated]**: general-purpose organizational tags
the author types in, not a curated taxonomy, and empirically always `null` in every sample fetched
this session, so even if it were populated for some decks it wouldn't reliably encode "this was a
tournament deck" the way the Tournaments-tab evidence in §2 suggests a separate, un-exposed
site-side flag does). `num_cards` and `influence_spent` are also present and untyped — useful,
uncontroversial deck-stat fields, unrelated to the popularity question, called out here only
because the task asked to look for anything already sitting unused in `Decklist.raw`.

**`created_at`/`updated_at` precision**: full ISO-8601 datetime with timezone offset
(`"2020-09-18T13:58:32+00:00"`, `"2026-08-08T19:01:30+00:00"`) — second-level precision, not just a
date. This is exactly what a real "Recent" tab needs and jinteki already receives it on every
synced row (confirmed independently by `src/sync/sync-decklists.ts`'s own comment describing a
`filter[updated_at][gte]=<ISO date>` incremental-sync param that "genuinely filter[s] server-side").

**API docs index** — **[docs-fetched]**, the full navigation of `api.netrunnerdb.com/api/docs`,
reproduced in full for the Decklists category (every other category also enumerated, for context):

```
Decklists
  - All Decklists
  - Filter - Get Decklists for a given faction
  - Filter - Get decklists containing all supplied Card ids
  - Filter - Get decklists excluding all supplied Card ids
  - Filter - Get decklists with a particular Identity
```

That is the **entire** documented decklists API surface: one list endpoint plus four filters
(faction, cards-contains, cards-excludes, identity). No sort-by-popularity, no
likes/votes/comments/tournament-placement filter or resource, no "featured"/"of the week" resource,
anywhere in the decklists category. (jinteki's own sync code separately confirms an *undocumented*
but functional `sort=created_at,id` param works server-side — useful for §4, still nothing
popularity-related.)

**A "Reviews" resource does exist** in the docs
(`All Reviews` / `Filter on a single card id` / `Get A Single Review`) and **[API-fetched]**,
`GET .../reviews?page[size]=1` confirms it really does carry `votes` and nested `comments` — but
critically, per both the docs' own filter name and the fetched resource's `relationships.card` /
`attributes.card_id`, **Reviews are a per-*card* feature** (community reviews of individual cards,
matching the "Reviews" section on NRDB's card page that the prior research report's §4/§8 already
found and correctly ruled out as out of scope). This is not decklist-related and does not change
the answer for decklists — flagged here only because it's the one place `votes`/`comments` genuinely
does exist in the public API, so it's worth being precise that it's the wrong resource, not
evidence the decklist answer might be softer than "no."

**Bottom line, stated plainly per the task's instruction**: the public NRDB v3 API decklist
resource, sampled directly and repeatedly, contains **zero** engagement or curation signal fields,
and the API's own documentation confirms no such resource or filter exists for decklists at all.
The real site's `sort=popularity`/"Number of Likes"/"Reputation of Author" (§1) and the
Tournaments tab's apparent structured flag (§2) are real features of NRDB's own web application,
backed by data that lives in NRDB's private application database — **not** exposed through the
public API jinteki syncs from. jinteki cannot reach it, faithfully or otherwise, through any
documented or observed API surface. This is a hard "no," not a "not yet found."

---

## 4. Proxies computable from data jinteki already has

Following the task's instruction to propose 2–4 honest alternatives, and to say plainly which tabs
have no honest equivalent rather than forcing one onto every NRDB tab:

1. **"Recent" — buildable, and should be labeled exactly that, unchanged.** `created_at` is real,
   precise, synced data (§3), and "sorted by newest first" is a completely honest, unqualified
   claim — it needs no relabeling because jinteki's version would compute the *literal same thing*
   NRDB's own Recent tab computes, just recency wins by the same wall-clock timestamp NRDB stores.
   The only work item is schema/perf, not honesty (see §5/Recommendation).

2. **"Recently updated" as a distinct second view — buildable, worth considering, not in the
   original six.** `updated_at` is separately tracked and already the field jinteki's own
   incremental sync keys off. A deck that's actively being revised (new cards swapped in) surfaces
   under this even if it was first posted years ago — a genuinely different, genuinely honest
   signal from "Recent" (posted-date), not a reskin of it. Optional, not required to satisfy the
   task's six tabs, but free to add if a "Recent" view is being built anyway since the query shape
   is identical with the sort column swapped.

3. **"Favorited by jinteki users" — buildable today, and a materially different, better-labeled
   idea than trying to fake NRDB's Popular tab.** jinteki already has its own private-per-user
   favoriting feature (`DecklistFavorite` model, `src/app/favorites/page.tsx`,
   `src/app/actions/favorites.ts` — **[jinteki source]**, confirmed live and already shipped, not
   speculative). A `COUNT(*) GROUP BY decklistId` over that table, surfaced as a small "Most
   favorited by jinteki users (N)" list, is **real, first-party engagement data** — just jinteki's
   own, at jinteki's (much smaller) scale, not NRDB's. This must be labeled distinctly from
   "Popular" precisely because it answers a different question ("what do jinteki's own users like"
   vs. "what does the Netrunner community at large like") — the task's instruction that a proxy
   "should probably be labeled differently... so it doesn't claim data it doesn't have" applies
   directly here. Cold-start caveat: with a small user base this list will be sparse/empty for a
   long time — worth surfacing only once there's a nontrivial number of favorites, or hiding it
   below some minimum count, so an empty or near-empty "Popular" look-alike doesn't itself read as
   broken.

4. **A date-window filter (e.g. "decklists posted in the last N days") as a substitute *shape* for
   "Decklist of the week," explicitly not a substitute for its *meaning*.** This can honestly answer
   "what's new this week," which is a real, computable question from `created_at` — but it must
   **not** be labeled "Decklist of the week" (singular/curated framing implies selection, which this
   isn't) or claim any endorsement/curation. A plain "Posted this week" filter preset on top of the
   Recent sort (item 1) is the honest version of the same underlying date-window idea NRDB's tab
   name gestures at, with the curation claim removed.

**Tabs with no honest equivalent — drop, don't fake:**

- **Popular** (by real engagement) — no underlying data exists or can exist without either scraping
  NRDB's private UI (fragile, likely against its ToS, and still not "jinteki's own data" as the
  task frames the exercise) or waiting years for jinteki's own user base to generate comparable
  volume. Item 3 above is the honest, differently-named alternative; a tab literally called
  "Popular" backed by jinteki's own thin favorite counts would materially mislead a visitor
  familiar with what "Popular" means on the real NRDB.
  A collector-number aside: jinteki's own sync run recorded ~74k total NRDB decklists live
  (`src/sync/sync-decklists.ts`'s own comment, `meta.stats.total.count`) — even a highly successful
  jinteki favoriting feature is extremely unlikely to reach comparable engagement density any time
  soon, reinforcing that this isn't a near-term "just needs more data" gap.
- **Tournaments** — §2/§3 together show this needs a structured flag NRDB keeps privately and never
  exposes publicly; jinteki only receives the placement text as freeform prose baked into `name`
  by convention, which is neither reliable (not every tournament deck follows the convention) nor
  structured (can't be filtered on cleanly — a `name ILIKE '%1st%'` search would both miss real
  entries and catch false positives). Not buildable faithfully; not worth faking with a fragile
  text heuristic presented as a real category.
- **Hot topics** — by definition needs a live activity-velocity signal (recent likes/comments
  relative to a time window); no proxy in jinteki's data approximates "velocity of an activity
  jinteki doesn't record at all." Drop.
- **Hall of Fame** — same root cause as Popular (needs all-time engagement totals jinteki doesn't
  have), with the added problem that even NRDB itself doesn't publish its selection threshold
  (§2) — there's no criterion to even attempt to approximate. Drop.
- **Decklist of the week** — the *curation* half (the site or its staff singling out one deck as
  noteworthy) has no jinteki equivalent and shouldn't be invented; item 4 above is offered only as
  a differently-named, differently-scoped date-window filter, not a rebuild of this tab.

So: **one tab ports over unchanged (Recent), one near-miss variant is free to add alongside it
(Recently updated), one genuinely new but honestly-labeled feature is buildable from data jinteki
already has (Favorited by jinteki users), one NRDB tab's *shape* (not name or meaning) can inform a
plain date-window filter, and three tabs (Popular, Tournaments, Hot Topics) plus one's full meaning
(Hall of Fame, Decklist of the Week's curation half) should be dropped from scope outright.**

---

## 5. Sort/filter mechanics of the results list itself

For the one directly-buildable tab (Recent) and the favorites-count proxy, cross-checked against
what jinteki already stores:

**What NRDB shows per row** (§2): decklist name (linked), author username (linked + reputation
score), post date, three engagement numbers. **What jinteki's `Decklist`/`DecklistCard` schema and
current `/decklists` list page already have** (**[jinteki source]**,
`prisma/schema.prisma` lines 88–101, `src/app/decklists/page.tsx`,
`src/lib/search/decklists.ts`):

| Row field | NRDB source | jinteki source | Gap? |
|---|---|---|---|
| Name | `attributes.name` | `Decklist.name` — real column, indexed (`gin_trgm_ops`) | None |
| Identity | `attributes.identity_card_id` | `Decklist.identityCode` — real column, FK to `Card` | None — already shown on `/decklists` (identity title link) |
| Author | `attributes.user_id` | **Not a real column** — only inside `Decklist.raw` (JSONB) | Already read out via cast on `/decklists/[id]` (**[jinteki source]**, line 66–71 of that file: `(decklist.raw as {...}).attributes`) — same pattern would work for a list-page column, but see perf note below if it needs to be sortable/filterable, not just displayed |
| Post date | `attributes.created_at` | Same — `raw`-only, already read the same way on the detail page | Same caveat as above |
| Reputation score | NRDB-internal, no API field | **Does not exist in jinteki at all** — no NRDB-user concept synced | Not buildable; not claimed as a proxy target anywhere in §4 |
| Engagement numbers (likes/comments/favorites) | NRDB-internal, no API field (§3) | jinteki has its own, unrelated `DecklistFavorite` count (§4 item 3) | Different data, must be labeled differently, not a gap to "close" |

**Reading `createdAt`/`user_id` for *display* on one detail page** (already shipped, confirmed live
in `src/app/decklists/[id]/page.tsx`) is free — no schema change, it's a JSON cast on an
already-fetched row. **Reading it for *sorting or filtering a list of ~74k rows*** is a materially
different cost: today there is no real `createdAt` column and no index on the JSONB path, so
`ORDER BY (raw->'attributes'->>'created_at')` (or an equivalent `WHERE` clause for a date-window
filter) would require a full-table JSONB extraction and sort on every request. This is the concrete
schema/sync gap a future build phase — not this research pass — would need to close: promote
`created_at` (and, if item 2 is taken, `updated_at`) from `Decklist.raw` into a real, indexed
`Decklist` column via a migration + one-time backfill (`UPDATE "Decklist" SET "createdAt" =
(raw->'attributes'->>'created_at')::timestamptz`), mirroring how `name`/`identityCode` are already
promoted. `sync-decklists.ts`'s `mapDecklist()` would also need one added line so future syncs keep
the column populated going forward, not just the one-time backfill. This is a normal, low-risk
schema addition (additive column, no behavior change to anything existing) but is explicitly a
schema change, called out per the task's instruction not to assume it's free.

**Favorited-by-jinteki-users count** (§4 item 3) needs no schema change at all — `DecklistFavorite`
already exists and a `GROUP BY` aggregate query is the entire cost.

---

## Recommendation

**(a) Concrete field list for jinteki's decklist advanced search**, matching NRDB's real form
(§1) and staying structurally consistent with `plans/ADVANCED_CARD_SEARCH_PLAN.md`'s
one-row-per-criterion pattern:

- Decklist name (text, matches `Decklist.name`)
- Author (text) — **display-only equivalent already exists** (detail page shows NRDB user id as
  inert text); as a *search filter* this needs the `createdAt`-style promotion treatment in (c)
  below, since `user_id` is also `raw`-only today.
- Faction, Side — mirror the existing `Card`-driven faction/side facets `/cards/advanced` already
  has; join through `Decklist.identityCode → Card`.
- Packs (multi) — needs a real per-deck pack-membership signal; NRDB derives this from the cards
  in the deck, so this can be computed as a join across `DecklistCard → Card → Pack`, no schema
  change.
- Cards used / Cards excluded (multi, card picker) — `DecklistCard` already supports "contains
  card X" directly; "excludes card X" is a `NOT EXISTS` variant of the same join. Both free.
- Format/legality (jinteki's `Format`/`Restriction` models — the direct equivalent of NRDB's
  `mwl_id`) — plausible now that Phase 6 exists, but was not the focus of this research pass and
  isn't claimed to be free; flag for scoping alongside the rest if built.
- Sort: **Date** only, to start (see (b)) — Popularity/Likes/Reputation radio options should not be
  offered at all, since nothing backs them.

**(b) Quick-view tabs — buildable vs. drop:**

| Tab | Verdict | Why |
|---|---|---|
| Recent | **Build, real data, same label** | `created_at` sort, exactly what NRDB itself computes |
| *(new, not an NRDB tab)* Recently updated | **Optional, build if cheap** | `updated_at`, same query shape as Recent |
| *(new, not an NRDB tab)* Favorited by jinteki users | **Build, real but different data — must be relabeled** | jinteki's own `DecklistFavorite`, not NRDB engagement — do not call it "Popular" |
| Popular | **Drop** | No underlying data, public or proxy-able, at any comparable scale |
| Hall of Fame | **Drop** | Same root cause as Popular; NRDB itself doesn't publish its own threshold |
| Hot Topics | **Drop** | Needs an activity-velocity signal jinteki has no record of at all |
| Tournaments | **Drop** | The real flag is private to NRDB; jinteki only sees unreliable freeform text in `name` |
| Decklist of the Week | **Drop the curation claim; a plain date-window filter may substitute the *shape*, under a different name** | The curatorial half has no jinteki equivalent and shouldn't be implied |
| My decklists / My favorites | **Out of scope** (per task) | Not researched |

**(c) Schema/sync gaps a future phase would need to close** (none required for this research pass
itself, all flagged rather than assumed free, per the task's instruction):

1. Promote `created_at` (and optionally `updated_at`, `user_id`) from `Decklist.raw` into real,
   indexed `Decklist` columns — needed before "Recent" (or an author filter) can sort/filter
   efficiently at ~74k+ rows; today only free-form *display* of these fields on the single-decklist
   detail page is unindexed-cost-free, per §5.
2. `sync-decklists.ts`'s `mapDecklist()` needs one added field-mapping line per promoted column so
   future incremental syncs keep them current, not just a one-time backfill.
3. If "Favorited by jinteki users" ships, decide a minimum-count threshold or an empty-state
   message so a near-empty list (very likely for a long time, given jinteki's user-base scale vs.
   NRDB's ~74k decklists) doesn't read as a broken "Popular" tab by visual association.
4. `Format`/`Restriction`-driven legality filter (mirroring NRDB's `mwl_id`) is plausible given
   Phase 6's existing models but wasn't scoped in depth here — treat as its own estimation item,
   not bundled for free with the rest of this recommendation.

**(d) Key files referenced:**

jinteki source:
- `plans/ADVANCED_CARD_SEARCH_PLAN.md`, `plans/SIMPLE_CARD_SEARCH_PLAN.md`
- `agent-reports/netrunnerdb-ux-research.md` (§6, §8 — the earlier pass being re-examined here)
- `src/app/decklists/page.tsx`, `src/app/decklists/[id]/page.tsx`
- `src/lib/search/decklists.ts`
- `src/lib/nrdb/types.ts` (`DecklistAttributes`)
- `src/sync/sync-decklists.ts`
- `prisma/schema.prisma` (`Decklist`, `DecklistCard`, `DecklistFavorite`, `Format`, `Restriction`)
- `src/app/favorites/page.tsx`, `src/app/actions/favorites.ts` (existing `DecklistFavorite` feature)
- `src/lib/decklist-notes.ts`, `src/lib/decklist-card-order.ts`

URLs actually fetched or directly evidenced via `WebSearch` snippets this session:
- `https://api.netrunnerdb.com/api/v3/public/decklists?page[size]=1` [API-fetched]
- `https://api.netrunnerdb.com/api/v3/public/decklists?page[size]=10&sort=-created_at` [API-fetched]
- `https://api.netrunnerdb.com/api/v3/public/reviews?page[size]=1` [API-fetched]
- `https://api.netrunnerdb.com/api/docs` [docs-fetched, full category listing]
- `https://api.netrunnerdb.com/api/docs/decklists/all_decklists` [docs-fetched]
- `https://api.netrunnerdb.com/api/docs/decklists/filter_-_get_decklists_with_a_particular_identity` [docs-fetched]
- `https://api.netrunnerdb.com/api/docs/decklists/filter_-_get_decklists_containing_all_supplied_card_ids` [docs-fetched]
- `http://nrdb.reteki.fun/en/decklists/search`, `/en/decklists`, `/en/decklists/recent`,
  `/en/decklists/halloffame`, `/en/decklists/dotw`, `/en/decklists/hottopics`,
  `/en/decklists/tournament` [mirror-fetched]
- `netrunnerdb.com/en/decklists/find?author=&faction=&mwl_id=&packs[]=...&sort=popularity&title=`
  and `netrunnerdb.com/en/decklists/find?cards[0]=22036` [websearch-corroborated real URLs]
- `netrunnerdb.com/en/decklists`, `/recent`, `/dotw`, `/tournament(/2)`, `/hottopics(/9)`,
  `/halloffame`, `/search`, `/find`, `/favorites`, `/mine` [websearch-corroborated real paths/titles]
- Direct `WebFetch` attempts against `netrunnerdb.com/en/decklists/search`,
  `netrunnerdb.com/en/decklists`, `netrunnerdb.com/en/decklists/recent`,
  `netrunnerdb.com/en/decklists/find?cards[0]=22036`, and
  `api-preview.netrunnerdb.com/api/docs/...` all returned HTTP 403/503 this session — noted as
  attempted-but-blocked, not silently skipped.
