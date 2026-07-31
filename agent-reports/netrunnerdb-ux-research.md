# NetrunnerDB UX Research — for jinteki Planning

## 1. Summary and observation-limitation caveats, up front

This report researches NetrunnerDB (netrunnerdb.com) — advanced/structured search, browsing a
pack/set, an individual card page, the search-syntax reference, and decklist browsing — to extract
UI/UX patterns applicable to jinteki. This case is different from the earlier Scryfall research
pass in one important way: **NRDB is jinteki's actual upstream data source** (`plans/PROJECT_PLAN.md`),
so its field names and vocabulary aren't just "a comparable product's design" — several of the
findings below point at data jinteki has *already synced* (visible in `Card.raw`/`Decklist.raw`
via `src/lib/nrdb/types.ts`'s typed attribute interfaces) but doesn't yet surface in any page.

**Direct `WebFetch` against `netrunnerdb.com` itself returned HTTP 403 on every attempt this
session** (homepage, `/find`, `/en/search`, `/en/syntax`, an `/en/card/...` page) — same
Cloudflare-style blocking the prior Scryfall research hit. Two things partially compensated:

1. **A live, functioning community mirror, `nrdb.reteki.fun`**, running the *same open-source
   NetrunnerDB codebase* (originally by `@alsciende`, now maintained at
   `github.com/Null-Signal-Games/netrunnerdb` — the same NSG org that publishes the comprehensive
   rules doc jinteki already scrapes for `/rules`). This mirror fetched successfully over plain
   `http://`, and every page/URL pattern described below from it (`/find/`, `/en/card/{id}`,
   `/en/set/{code}`, `/en/decklists`, `/en/decklist/{id}/{slug}`, `/en/syntax`) was **directly
   fetched and read this session**, not inferred. Its own footer is explicit that it serves the
   fan-made "Netrunner Reboot" alternate card pool, not NSG's official card pool jinteki syncs —
   so **card-pool-specific content (which cards exist) is not representative of official NRDB**,
   but **UI chrome, page structure, form fields, URL scheme, and search-syntax grammar are the
   same underlying software** and were cross-checked against real `netrunnerdb.com` URLs/content
   surfaced via `WebSearch` wherever possible (noted inline below).
2. **`WebSearch` snippets that describe or quote `netrunnerdb.com` directly** (not the mirror) —
   used to corroborate or extend mirror-sourced claims, and clearly marked as such.

Every claim below is tagged as one of: **[mirror-fetched]** (read directly from
`nrdb.reteki.fun` this session), **[netrunnerdb.com via search]** (a `WebSearch` snippet
describing/quoting the real site), or **[general knowledge, unconfirmed this session]** — matching
the discipline `agent-reports/scryfall-ux-research.md` used. Nothing below is invented past what
one of these three tags can support. **No visual/interactive detail** (exact spacing, colors,
hover states, animation) is claimed anywhere — everything here is information architecture: what
fields/sections exist, what they're labeled, how they're grouped, what they link to.

---

## 2. Advanced search / structured search

**[mirror-fetched]** The mirror's search entry points are `/find/` (a query-string-driven results
page — `?q=<query>` using the syntax in §5) and `/en/search` (linked from the nav as "Advanced").
Sort controls, always visible above results: **"Sort by Name / Set Name / Release Date / Faction /
Type / Cost / Strength."** View-mode controls, also always visible: **"View as a Checklist / Text
only / Full Cards / Images only / Rulings only / Names only"** — six distinct display modes, more
than Scryfall's roughly four (`grid`/`checklist`/`text`/`full`). This is a materially richer
"how do you want the same result set rendered" control than jinteki's current two-mode
(`list`/`grid`) toggle on `/cards` — see recommendations.

**[netrunnerdb.com via search]** `WebSearch` results independently surfaced `netrunnerdb.com/en/search`
("Card Search") and `netrunnerdb.com/search_new/` ("Card Search (new)") as separate, real pages —
i.e. the real site appears to have (or had) two search UIs, an older `/find`-style one and a newer
one advertised as offering "new features and a faster search experience." Direct fetch of either
was blocked (403), so their specific field layout wasn't observable this session — flagged as a
gap, not invented.

**Key structural fact, confirmed by fetching a set page through the same `/find/` endpoint
(`?q=e:core`, [mirror-fetched], see §3)**: exactly like Scryfall, **a set/pack-scoped browse view
is just the same search UI pre-filtered by one field** (`e:` = set code) — there is no separate,
more limited "browse a set" system. This reinforces the same "form/filters and the query string
are one model" pattern the Scryfall report flagged as worth carrying over conceptually.

---

## 3. Browsing a set/pack of cards

**[mirror-fetched]**, from `/find/?q=e:core` (Core Set, the mirror's equivalent of NSG's actual
Core Set which both card pools share):

- **Set-level pagination**: prev/next links between whole sets/packs (`"← [Previous Set]"` /
  `"[Next Set] →"`), in addition to the per-card prev/next links on individual card pages (§4).
  Browsing a pack is a first-class sequential experience, not just "here's a filtered list."
- **Card count shown**, e.g. "113 cards," matching Core Set's real known card count.
- **Default table/list view columns**: Title (linked), Faction, Type, Subtype, Set — a dense
  five-column row per card, not an image grid by default. The image-forward grid is one of the six
  view modes ("Full Cards"/"Images only"), not the default.
- Same sort/view controls as §2 (they're the same underlying search UI, just pre-filtered).

**[general knowledge, unconfirmed this session]** The real netrunnerdb.com additionally exposes a
**Cycle** browsing level above individual Sets (NSG groups releases into cycles, e.g. "Elevation
Cycle"), consistent with the `c:` (cycle) operand confirmed in §5 — not independently confirmed by
a fetched page this session, but consistent with both the syntax operand list and jinteki's own
data model (`Pack` exists in `prisma/schema.prisma`, but there's no `Cycle`/`Cycle`-equivalent
grouping table).

---

## 4. Individual card page

**[mirror-fetched]**, from `/en/card/01050` (Sure Gamble — a Core Set card identical across both
card pools, so this content is representative of the real card too, not Reboot-specific):

- **Header/stats line**: `Event • Cost: 5 • Influence: 0` — type, then whichever cost/strength/etc.
  fields apply to that type, inline in one line (jinteki's detail page does this too, as a `<dl>`
  grid rather than one line — same underlying idea).
- **Card text**, then **flavor text** below it.
- **Attribution line**: `Neutral • Kate Niemczyk • Core Set 50` — faction, **illustrator**, and
  pack name + collector number, all in one line. jinteki's Phase 4 report already confirmed
  illustrator data was **never synced** (no per-printing model), so this specific field is a known,
  already-documented gap, not a new finding — restated here only because NRDB's real card page
  treats it as a first-class, always-shown field, one line away from the text everyone reads.
- **"All sets:"** — a list of every pack the card was printed in (this card's reprint history),
  each presumably linking to that pack. This is the *lightweight, text-only* version of
  "prints/versions" — materially smaller than Scryfall's per-printing-image browser (§8 below), and
  directly buildable from data jinteki already has (see Recommendations §7, item 3).
- **"Links:"** — external cross-links, e.g. `Decklists | ANCUR` on this card. `ANCUR` is the
  "Android Netrunner Comprehensive Unofficial Rules" wiki — a fan rules-reference site, i.e. NRDB
  links out to a *rules explainer* from the card page, conceptually adjacent to jinteki's own
  right-click rule-section popover (Phase 5) but NRDB does it as an outbound link to a third-party
  wiki rather than an in-house rules doc (jinteki's own comprehensive-rules glossary makes this
  link-out pattern unnecessary — jinteki already does the equivalent better, in-house).
- **"MWL Entries"** — Most Wanted List (banlist/restriction) status for that card, per format.
  **[netrunnerdb.com via search]** corroborated independently: NRDB's ban-list model has states
  **Banned** (unplayable), **Restricted** (deprecated mechanic, one-per-deck), and **Points**
  (Eternal format: cards carry a point value, decks must total ≤7 points) — this is Netrunner's
  actual current competitive-restriction mechanism, distinct from and simpler than Magic's
  per-format Legal/Not-Legal/Restricted/Banned table. See §6 and Recommendations §7 item 8 — this
  is a genuine schema gap in jinteki, not present at all today.
- **"Rulings"** section (a list, or "No rulings yet for this card") — jinteki already has the
  equivalent, and arguably a *better* surfaced version (Phase 5's right-click popover shows
  rulings inline anywhere a card is referenced, not just on its own detail page).
- **"Reviews"** section — community-submitted card reviews/ratings, entirely separate from
  Rulings. **Not something jinteki has or should build** — see §8.
- **Per-card prev/next navigation** within its pack (`"← Infiltration"` / `"Crypsis →"`), i.e. a
  card page doubles as a way to flip through the whole set in printed order — jinteki's card
  detail page has no equivalent (would need a synced collector-number/position field it doesn't
  have; see Recommendations §7 item 9).
- **Inline "Add a ruling" / "Edit a ruling" / "Delete a ruling" forms** directly on the card page —
  community content-authoring UI. Not applicable; jinteki's admin-only sync model has no
  user-authored rulings (see §8).

No right-click/context-menu behavior, keyboard shortcuts, or copy-link affordance was observed on
this page **[mirror-fetched, explicitly checked and absent]** — jinteki's own Phase 5 right-click
popover is not something NRDB's card page itself does (jinteki already built something NRDB's own
card page doesn't have).

---

## 5. Search syntax

**[mirror-fetched]**, from the mirror's own `/en/syntax` reference page, cross-checked against
**[netrunnerdb.com via search]** snippets describing the real site's `/en/syntax` page — the
operand list, operator set, and worked examples matched closely between the two independent
sources wherever both were available, which is good corroboration this is accurate for the real
site's grammar, not just the Reboot fork's:

| Code | Field | Notes |
|---|---|---|
| *(none)* | Card title | plain text, default/no-prefix match |
| `x` | Card text | |
| `a` | Flavor text | |
| `e` | Set/pack | |
| `c` | Cycle | |
| `t` | Type | e.g. `t:asset`, `t:identity` |
| `f` | Faction | accepts full faction codes or shorthand (first letter of each non-neutral, non-mini faction; second letter or first-two-letters for mini-factions) |
| `s` | Subtype | jinteki's exact equivalent of `Card.keywords` |
| `d` | Side | Corp/Runner — jinteki's exact equivalent of `Card.sideCode` |
| `i` | Illustrator | jinteki has no illustrator data (known gap, §4) |
| `o` | Cost | context-sensitive: play cost (events/operations), install cost (Runner), rez cost (Corp) |
| `g` | Advancement cost | agendas only |
| `m` | Memory usage (MU) | |
| `n` | Influence cost | |
| `p` | Strength | |
| `v` | Agenda points | |
| `h` | Trash cost | |
| `r` | Release date | only `<`/`>` operators, `now` or `YYYY-MM-DD` |
| `u` | Unique | |
| `z` | Rotation | `current`, `latest`, or a rotation designation |
| `b` | Banlist/format | **[netrunnerdb.com via search only — not present in the mirror's syntax list, likely because the Reboot fork has no MWL/format system]**. Excludes cards banned by a given banlist; accepts `active`/`latest`. |

**Operators**: `:` equals, `!` different-from, `<` less-than, `>` more-than — a small, consistent
vocabulary reused across every field, same "one operator grammar, not one per field" idea the
Scryfall report called out as the most portable structural lesson (§5 of that report).

**Boolean logic**: space-separated terms are an implicit AND; `|` (pipe) is OR, e.g.
`t:asset|upgrade f:n` ("Assets and Upgrades from NBN"); `-`/`!` negates. Quoting handles
multi-word literals: `s!barrier|sentry|"code gate"`.

**Structural comparison to jinteki's current search** (`src/lib/search/cards.ts`,
`plans/SEARCH_MATCHING.md`): jinteki's `q` free-text is *pure* `pg_trgm`
`word_similarity`/`ILIKE` fuzzy matching over `title`/`text`, with **zero field:value operator
syntax** — the structured facets (`faction`, `side`, `type`, `keyword`) exist only as separate
`<select>` dropdowns in `/cards/page.tsx`'s form, entirely disconnected from the `q` text box.
NRDB's model treats the dropdowns and the query string as two views of *one* grammar (fill the
form → it compiles to the same query string a power user could type directly). This gap — and a
concrete, low-cost way to close part of it — is the centerpiece of Recommendations §7 item 1.

**Also worth noting**: NRDB's operand-to-column mapping lines up almost exactly with jinteki's own
`Card` schema columns — `f`→`Card.factionCode`, `t`→`Card.typeCode`, `s`→`Card.keywords`,
`d`→`Card.sideCode`, `e`→`Card.packCode`, `n`→`influence_cost` (already read out of `raw.attributes`
on the detail page, per `agent-reports/phase-4.md`'s `ATTRIBUTE_FIELDS` list). This 1:1-ness is
exactly why this research (unlike the Scryfall pass) is directly actionable rather than needing
translation — NRDB's vocabulary *is* jinteki's own data model, just with a query grammar on top.

---

## 6. Decklist browsing (directly relevant to jinteki's `/decklists`)

**[mirror-fetched]**, from `/en/decklists` (list) and `/en/decklist/421/get-carried-by-snowflake`
(detail):

- **List page** ("Popular Decklists"): tabs for **Popular / Recent / Tournaments / Hot topics /
  Decklist of the week / Hall of Fame / My favorites / My decklists / Search** — i.e. NRDB has
  several curated *views* of the same underlying decklist table (recency, popularity, tournament
  provenance), not just one filtered/sorted list. Each row shows name, author (linked to a user
  profile), engagement metrics (likes/votes/comments as three numbers), and date.
  **[netrunnerdb.com via search]** corroborated: the real site has the identical URL family
  `/en/decklists` (Popular), `/en/decklists/recent`, `/en/decklists/mine`, `/en/decklists/search` —
  strong confirmation the mirror's structure matches the real site here.
- **Detail page**: title, author + reputation, post date, engagement metrics, a free-text
  **description/notes** field (this deck's said "Snowflake singlehandedly justifies..."), **MWL
  status** ("No MWL" for this deck), **rotation status** ("Pre-rotation decklist"), a
  **derivation** note ("None. Self-made deck here" — i.e. decks can be forked/based on another
  published deck, with that lineage shown), the packs/sets the deck draws from, and (not
  extracted in this session's fetch, but standard/expected) the actual card list, grouped by type
  with quantities and influence pips.
- **Deckbuilding tool cluster** on the detail page: card-draw simulator, odds/probability
  calculator, multiple **export formats** (bbCode, Markdown, plain text, and — note, unrelated
  name collision worth flagging so it's never confused with this project — **"Jinteki.net"**, a
  separate, pre-existing third-party online Netrunner client, not this repository), download as
  text file or OCTGN format, a comments section, and sort-the-card-list controls (by Type/Set/
  Faction/Name). All of this is deckbuilding/community-interaction tooling, explicitly out of
  scope per `PROJECT_PLAN.md`'s "no user-created decklists / no deckbuilder" line — see §8.
- **Decklist IDs on the real site are UUIDs** (confirmed via a `WebSearch`-surfaced real
  `netrunnerdb.com/en/decklist/9ce4e74a-d764-4cff-86b8-42c888aa07da/...` URL), vs. the mirror's
  short numeric IDs — jinteki's own `Decklist.id` is already a `String` (synced verbatim from
  NRDB's real UUID-style ids per `src/sync/sync-decklists.ts`), so this is already consistent,
  noted only for completeness.

**Concretely relevant to jinteki's own `DecklistAttributes` type** (`src/lib/nrdb/types.ts`):
the synced NRDB decklist resource has typed fields `user_id`, `created_at`, `updated_at` that are
stored in `Decklist.raw` (via `sync-decklists.ts`'s `raw: JSON.parse(JSON.stringify(resource))`)
but **none of the three are extracted into a real column or shown anywhere on
`/decklists/[id]/page.tsx`** — that page currently shows only name, identity, total card count, and
the card list. See Recommendations §7 item 4.

---

## 7. Recommendations for jinteki

Grounded in jinteki's actual stack (Postgres/Prisma + `pg_trgm`, no dedicated search engine, no UI
component library, `searchParams`-driven pages) and its actual current state — **Phase 5 already
shipped** a keyword filter, explicit sort control, grid/list toggle, `/random`, clickable facet
links, and an NSG-verified badge, all originally inspired by the Scryfall pass
(`plans/PHASE_5_PLAN.md`). So the items below focus on what's **new** relative to that already-done
work, prioritized the same way the Scryfall report was.

### Quick wins (small, self-contained, no schema change)

1. **Add a `pack` filter to `/cards`.** This is the most direct, concrete gap this research found:
   `Card.pack` (a real relation to the `Pack` model) already exists and is already displayed on
   `/cards/[code]`'s detail page ("Pack: X"), but `/cards/page.tsx`'s search form has no pack/set
   filter at all — the single most basic NRDB browsing pattern (§3: "browse a set") has zero
   equivalent in jinteki today. A `pack` `searchParams` value plus
   `Prisma.sql`\`"packCode" = ${pack}\`` in `src/lib/search/cards.ts`'s `searchCards()` — mirrors
   the existing `faction`/`side`/`type`/`keyword` equality-filter pattern exactly (same file,
   same shape, `<select>` populated via `prisma.pack.findMany()`). Effectively free given the
   pattern already established four times over in that file.
2. **Surface a lightweight "also printed in" list on `/cards/[code]`**, NRDB's "All sets:" pattern
   (§4) — but the *text-only* version NRDB itself uses, not Scryfall's full per-printing-image
   browser (which jinteki correctly ruled out already, see §8). `CardAttributes.card_set_ids` and
   `num_printings` (`src/lib/nrdb/types.ts`) are already synced verbatim into `Card.raw` for every
   card — this is literally the "data already synced, not yet shown" case this task asked to look
   for. Rendering `raw.attributes.card_set_ids` as a small list of pack names (resolved against
   the existing `Pack` table, same join already used for the single `packCode`) needs no schema
   change and no new sync — just reading more of a JSON blob jinteki already has.
3. **Show decklist author and creation date on `/decklists/[id]`.** `DecklistAttributes.user_id`
   and `.created_at` (§6) are typed, synced fields sitting in `Decklist.raw` today, unused. NRDB's
   own decklist page treats author + date as basic, always-shown metadata. Caveat: `user_id` is
   an NRDB user id, not a jinteki `User` — it can only be rendered as inert text (or a link out to
   `netrunnerdb.com`'s own profile page), not linked to anything inside jinteki, since jinteki has
   no synced NRDB-user table. Still a one-line, no-schema-change addition once decoded from
   `Decklist.raw`.
4. **Check whether `Decklist.raw` carries a description/notes field** (NRDB's detail page shows
   one, per §6, e.g. "Snowflake singlehandedly justifies...") — `DecklistAttributes`'s
   `[key: string]: unknown` index signature means it isn't ruled out by the current type, but this
   research could not confirm its exact key name from a fetched real decklist API response this
   session. Cheap to check directly (`psql` against a few real `Decklist.raw` rows, same
   "inspect real rows before building" discipline `agent-reports/phase-4.md` already used for the
   image-URL field) before deciding whether to surface it.
5. **A richer set of "View as" modes on `/cards`**, matching NRDB's six (§2/§3) rather than
   jinteki's current two (`list`/`grid`). The two most valuable NRDB modes jinteki lacks: a dense
   **"Checklist"**-style view (title + one-line stat summary, no image, tighter row height than the
   current list view — useful for scanning a whole pack) and **"Names only"** (just linked titles,
   maximum density). Same `view` `searchParams` pattern already in `src/app/cards/page.tsx`
   (`hrefWithOverrides`), just more branches on the existing conditional — no new query.

### Fits a near-term phase (small-to-medium, no new infrastructure)

6. **A minimal `field:value` prefix syntax inside the existing `q` box**, the one structural idea
   from §5 worth actually building (unlike the Scryfall report's version of this same idea, which
   flagged it as "speculative... not clearly worth it" because Magic's operators don't map onto
   jinteki's schema). NRDB's operands map almost 1:1 onto columns jinteki's `<select>` filters
   *already* query (`f:`→`faction`, `t:`→`type`, `s:`→`keyword`, `d:`→`side`). A small pre-parse
   step in `parseCardSearchParams()` (`src/lib/search/cards.ts`) that scans `q` for
   `word:` tokens matching those four prefixes, strips them out, and folds them into the existing
   `faction`/`type`/`keyword`/`side` params (falling back to plain trigram search for whatever
   text remains) would let power users type `f:anarch virus` in the one box that exists today and
   get the same result as filling in two separate dropdowns — while the dropdowns stay the primary,
   discoverable UI for everyone else. Genuinely low-risk: it's purely additive parsing in front of
   filters that already exist and are already tested (`cards.test.ts`).
7. **A `sort` control on `/decklists/[id]`'s own card list**, mirroring `/cards`' existing `order`
   pattern (item 2 of the already-shipped Phase 5 work) — NRDB's decklist detail page offers
   Type/Set/Faction/Name sort of the card list (§6); jinteki's hardcodes type-then-title. Minor,
   but the pattern (a `sort` searchParam controlling an in-memory `Array.sort()` on
   `decklist.cards`, already fetched) is nearly free to add to the existing detail page.
8. **NRDB's "one operator grammar reused everywhere" principle**, applied to jinteki's *existing*
   `order` params — not new scope, just consistency: `cards.ts`'s `ORDER_COLUMNS` and any future
   `decklists`/`rule-sections` sort options should keep using the same param name/shape
   (`order=<column>`) rather than each page inventing its own — already true today, worth
   preserving as more sort options get added per item 7.

### Bigger lift / future phase (real new work; don't block anything on these)

9. **Sync and surface NRDB's Most Wanted List / format-legality data (§4, §6).** This is the one
   finding in this report that is **not** analogous to something Scryfall does that doesn't apply
   (contrast with prices/printings in §8) — it's a real, current Netrunner mechanic
   (Banned/Restricted/Points-per-Eternal-deck, per NRDB's own `b:` search operand and `/en/banlists`
   page) that jinteki's schema has **zero representation of today** — no `Format`, `Restriction`,
   or `MWL`/banlist model exists in `prisma/schema.prisma`. The NRDB v3 API's "Meta Information"
   category (confirmed via its own docs index, §API investigation) includes a `restrictions`
   resource and `snapshots` (point-in-time banlist states) specifically for this. Worth a real
   future phase: a new sync script + schema addition (a `Restriction`/`CardRestriction` model,
   roughly), then a "Legal in Standard/Startup, Banned in Eternal"-style line on
   `/cards/[code]`, and possibly a `restriction`/format filter on `/cards`. Bigger lift than
   anything above (new schema + new sync, not just new UI over existing data), but directly
   useful to real Netrunner players browsing cards, and squarely in-scope (it's card *data*, not
   a deckbuilder feature) — doesn't conflict with `PROJECT_PLAN.md`'s explicit "no deckbuilder"
   exclusion the way item 10 in §8 would.
10. **Per-pack card ordering / prev-next-within-set navigation on `/cards/[code]`** (§4's
    "← Infiltration / Crypsis →" pattern). Would need a synced collector-number/position field
    jinteki doesn't currently have (`CardAttributes` has no such field today) — a real sync-layer
    change, not just a UI addition. Nice-to-have, not urgent; flagged here so it isn't confused
    with item 1 (pack *filtering*, which needs nothing new) — this is pack *ordering*, which does.

---

## 8. What NRDB does that should be deliberately skipped, not copied

- **Deckbuilding tools**: card-draw simulator, odds/probability calculator, multi-format deck
  export (bbCode/Markdown/plain text/"Jinteki.net"/OCTGN), deck derivation/forking, "My Decks."
  Explicitly out of scope per `PROJECT_PLAN.md`'s Users & Auth section ("no user-created decklists
  / full deckbuilder — that's a separate, larger phase"). Every one of these assumes decks are
  *authored* on the site; jinteki's decklists are read-only synced data.
- **Community reviews and user-submitted rulings** (§4's "Reviews" section, "Add/Edit/Delete a
  ruling" forms). jinteki's `Ruling` table is admin-sync-only, sourced from NRDB's own rulings
  endpoint (`PROJECT_PLAN.md`); there's no user-generated-content model to hang a review/ratings
  system off of, and none is planned (`Users & Auth`: browse + favorite, not author content).
- **Full per-printing "prints/versions" browsing with per-printing images/illustrator/language**
  (Scryfall's version of this, referenced for contrast in §4). NRDB's *own* version is already
  much lighter (a plain "All sets:" text list, §4) than Scryfall's — and even that light version
  needs no new schema for jinteki (item 2, §7). But the *heavy* version (illustrator per printing,
  a dedicated `Printing` model) was already correctly ruled out in Phase 2/4
  (`agent-reports/phase-4.md`: "no `Printing` model in this schema... a Phase 2 schema/scope
  decision") — nothing here changes that conclusion.
- **Curated decklist "views"** beyond simple filtering — Popular/Hot Topics/Hall of Fame/Tournament
  tabs (§6) depend on engagement signals (likes, votes, tournament results) jinteki has no data
  for and no plan to collect (jinteki's own favorites are private-per-user, not a public
  popularity signal). Not worth building a fake "popular" ranking with no real signal behind it.
- **User profiles / social features** (author reputation numbers, comment threads on decklists and
  card pages). No `User`-facing profile concept exists in jinteki beyond auth identity + favorites,
  and building one is a different, much larger product direction than "browse/search a card
  database," per `PROJECT_PLAN.md`'s stated purpose.
- **External links to a third-party rules wiki (ANCUR, §4)**: NRDB does this because it has no
  in-house rules glossary of its own. jinteki already has a better in-house answer to the same
  need (`/rules`, right-click rule-section popover from Phase 5) — linking out to a third party
  would be a regression, not an improvement.

---

## Key jinteki files referenced

- `plans/PROJECT_PLAN.md`, `plans/PHASE_4_PLAN.md`, `plans/PHASE_5_PLAN.md`, `plans/SEARCH_MATCHING.md`
- `agent-reports/phase-4.md`, `agent-reports/phase-5.md`
- `src/app/cards/page.tsx`, `src/app/cards/[code]/page.tsx`
- `src/app/decklists/page.tsx`, `src/app/decklists/[id]/page.tsx`
- `src/lib/search/cards.ts`, `src/lib/search/decklists.ts`
- `src/lib/nrdb/types.ts` (`CardAttributes`, `DecklistAttributes` — the typed shape of what's
  already synced into `Card.raw`/`Decklist.raw`)
- `src/sync/sync-decklists.ts` (confirms `raw: JSON.parse(JSON.stringify(resource))` — the full
  NRDB resource is retained even where only a few fields are extracted into typed columns)
- `prisma/schema.prisma` (`Card`, `Pack`, `Faction`, `Decklist`, `DecklistCard`, `Ruling` — and the
  confirmed *absence* of any `Format`/`Restriction`/banlist model, relevant to §7 item 9)
