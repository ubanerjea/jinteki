# Scryfall UX Research — for jinteki Phase 5+ Planning

## 1. Summary and a hard limitation, up front

This report researches three Scryfall (scryfall.com) pages — the [advanced search form](https://scryfall.com/advanced), a [set-browsing page](https://scryfall.com/sets/pcy?as=grid&order=set), and an [individual card page](https://scryfall.com/card/dmr/184/wild-growth) — plus the [search syntax reference](https://scryfall.com/docs/syntax), to extract product-shape patterns applicable to jinteki's card/decklist/rules browsing UI.

**Important caveat: `scryfall.com` returned HTTP 403 (Cloudflare bot protection) for every direct fetch attempted this session** — the three target pages, the syntax docs, the homepage, and even a Wayback Machine snapshot attempt (blocked at the tool level). This means **none of the structural claims below come from directly viewing the live pages in this session.** Instead, this report is built from two sources, and each claim below is attributable to one or the other:

- **Secondary sources actually fetched this session** (four articles that describe Scryfall's UI in prose, one of which is EDHREC's official syntax guide): [Lucky Paper's "Searching with Scryfall"](https://luckypaper.co/articles/searching-with-scryfall-magic-at-your-fingertips/), [EDHREC's "Guide to Scryfall Syntax"](https://edhrec.com/guides/guide-to-scryfall-syntax), [TheGamer's "How To Use Scryfall"](https://www.thegamer.com/magic-the-gathering-mtg-scryfall-guide/), and [PrintACube's "Searching with Scryfall for MTG Cubes"](https://printacube.com/searching-with-scryfall-for-mtg-cubes/). Web search snippets supplemented these where a full fetch wasn't available.
- **General background knowledge** of Scryfall's site (a well-known, widely-used tool) — used only to fill in structural details (e.g. the specific field list on the advanced-search form) that the fetched articles didn't spell out completely. These are marked "(general knowledge, not directly confirmed this session)" wherever used, per the task's instruction not to invent details I can't actually back up.

**No visual/interactive details** (exact grid layout, spacing, hover states, colors, animations, autocomplete dropdown behavior) are claimed anywhere below — those genuinely require rendering the page, which wasn't possible. Everything here is about information architecture: what fields/sections exist, what they're called, how they're grouped, and what they link to.

---

## 2. Advanced search (`/advanced`)

Scryfall's advanced search is a **structured form that compiles down to the same query string used by the free-text search bar** — filling in the form and submitting it produces a URL like `/search?q=t%3Acreature+c%3Dw+r%3Ac` (confirmed by a search result URL surfaced this session: `scryfall.com/search?as=grid&order=name&q=(oracle:"...") type:creature color=w rarity:c`). This is the single most important structural fact: **the form and the query language are two views of the same underlying model**, not two separate systems. Every field in the form has a corresponding syntax operator (see §5), so power users can skip the form entirely and type the equivalent query directly, and form-users' queries are still visible/editable as text after submission.

Per the fetched TheGamer article and general knowledge, the form is organized into **labeled field groups**, roughly:

- **Card Name** — plain text, substring match against name.
- **Text** — Oracle/rules-text contains (maps to `o:`/`oracle:`), with a distinct "full Oracle text including reminder text" variant (`fo:`/`fulloracle:`).
- **Type Line** — contains these words (maps to `t:`/`type:`), e.g. "legendary creature."
- **Colors** — checkboxes for W/U/B/R/G/Colorless, plus a comparison mode (roughly: "exactly these colors" vs. "at least these colors" vs. "at most these colors" — maps to `c=`, `c:`/`c>=`, `c<=`), and (general knowledge) an "ignore color indicator/produced mana" toggle.
- **Color Identity** — same shape as Colors but for Commander-format color identity (`id:`/`identity:`), (general knowledge) including a convenience dropdown of preset two/three-color guild/shard/wedge names (e.g. "Esper," "Sultai").
- **Mana Cost** — an exact-symbols text field (with, per general knowledge, a clickable mana-symbol picker) plus a separate **Mana Value** (formerly "CMC") numeric comparison (`mv<`, `mv=`, `mv>=`, etc.).
- **Stats** — Power, Toughness, Loyalty comparisons, each with an operator dropdown (`<`, `<=`, `=`, `>=`, `>`) and a value.
- **Set/Block** — a searchable Set dropdown and Block dropdown (maps to `s:`/`set:`, `b:`/`block:`).
- **Format Legality** — a Format dropdown (Standard, Pioneer, Modern, Legacy, Vintage, Commander, Pauper, Historic, Alchemy, Penny Dreadful, etc.) paired with a status dropdown (legal / not legal / restricted / banned) — maps to `f:`/`legal:`, `banned:`, `restricted:`.
- **Rarity** — checkboxes (Common, Uncommon, Rare, Mythic, Special/Bonus) — maps to `r:`/`rarity:`.
- **Artist**, **Flavor Text**, **Watermark** — plain text fields.
- **Prices** — USD/EUR/Tix comparisons.
- **Criteria** ("is:") — per TheGamer's description, "a huge list of special criteria made by Scryfall itself" — a multi-select of boolean card properties unrelated to core rules text (full-art, promo type, reprint status, foil-only, textless, story-spotlight, land-cycle membership like fetchland/shockland, etc.). This is effectively **progressive disclosure of Scryfall's long tail of niche operators** — instead of every operator getting its own form field, the rare/niche ones are consolidated into one searchable multi-select so the main form stays a manageable ~12–15 groups.
- **Preferences** — (general knowledge) language selector, "include extra cards" (tokens/emblems/schemes) checkbox, and the same **Display As / Sort** controls that appear on the results page (see §3) — i.e. sort/display preference is set once, up front, alongside the filters, not bolted on after the fact.

**Progressive disclosure pattern observed**: the form doesn't force every user through every field — TheGamer's article explicitly notes "you don't need to fill in every field, only the ones that are relevant to you," and the field grouping (Name/Text/Type at top, more specialized stuff like Watermark/Criteria lower) puts common filters first and rare ones later, without hiding them behind extra clicks (no accordion/tabs — it's a single scrollable form with visual grouping via section headings).

---

## 3. Browsing a set (`/sets/{code}?as=grid&order=set`)

Direct fetch was blocked, but the URL parameters themselves (`as=grid`, `order=set`) and the corroborating web-search summary of Scryfall's results-page controls establish the shape:

- **`as=` (Display As) parameter** — controls the view mode. Known values, per search-result summaries: `grid` (image-forward card grid — the default), `checklist` (dense text list, good for "have I got this" scanning), `text` (compact text-only rows), and a "full" combined view. This is a **URL-addressable, bookmarkable/linkable view toggle** — not client-only UI state.
- **`order=` parameter** — sort key. Per search results: `name`, `set`, `rarity`, `color`, `usd`/`eur`/`tix` (price), `cmc`/mana value, `power`, `toughness`, `artist`, `released`, `spoiled`, `edhrec` (popularity rank), `penny`, `review`, `imageupdated`. Paired with a `direction=asc|desc` parameter.
- Both are exposed as **dropdown menus at the top of the results page** ("Sorted By" per TheGamer's article, plus the As/Display selector), i.e. discoverable UI controls, not just an API-literate user's hand-typed URL param — but because they're plain query params, the same control surface works for a full free-text search result set and for a set-scoped browse (the set page is really just a search pre-filtered by `set:pcy`, wearing set-specific chrome).
- **Grid view at-a-glance info** (general knowledge, not confirmed by a fetched source this session): card image thumbnail, name, and typically mana cost/rarity indicator overlaid or adjacent — the grid is genuinely image-first, deferring text detail to a click-through.
- **Pagination**: the underlying API paginates at 175 cards/page (confirmed via search-result summary of the API docs); the web UI correspondingly paginates rather than infinite-scrolling — consistent with the URL-driven-state philosophy above (a page number is a clean query param; infinite scroll isn't).
- Set-level metadata (release date, set code, total card count) is expected as a header above the grid, standard for this kind of page, but no fetched source described the literal fields this session — flagged as **inferred, not confirmed**.
- Because a set page is filtered search, **anything filterable in Advanced Search is also filterable within a set view** by adding to the query (e.g. `set:pcy is:full-art`) — the set page isn't a separate, more limited system.

---

## 4. Individual card page (`/card/{set}/{number}/{slug}`)

Per TheGamer's fetched article (the most concrete source obtained on this page) plus general knowledge, the page is organized as:

- **Header/identity**: card name, mana cost, type line, set/rarity/collector-number, artist credit — all near the image.
- **Card image**, prominent, with (general knowledge) a language selector for viewing the card in other printed languages, since Scryfall indexes every localized printing.
- **Oracle text** — "the card's most up-to-date Oracle text," i.e. explicitly the *current, errata'd* rules text, not necessarily the text literally printed on that physical card. This is a deliberate normalization: one canonical ruleset is shown regardless of which old printing you're looking at.
- **Rulings** — described as "any further rules or judgments" attached to the card. (General knowledge, not confirmed by a fetched source this session: each ruling is dated and sourced — official WotC rulings team vs. Scryfall's own editorial notes — displayed as a simple reverse-chronological list under a "Rulings" heading.)
- **Legalities** — a table/list of format legality, one row per format (Standard, Pioneer, Modern, Legacy, Vintage, Commander, Pauper, etc.), each with a status (Legal / Not Legal / Restricted / Banned). A companion FAQ page (`/docs/faqs/what-do-the-different-legalities-mean`, found via search but not fetched) exists specifically to explain what each status means — i.e. Scryfall treats the legality table as something that needs its own explainer, not something assumed self-evident.
- **Prints/versions** — "Sets and printing information" with a **"Show all prints" link** that reveals "every print a card has ever had." This is the *one-card-many-printings* model: a single logical card (e.g. "Wild Growth") has one detail page per distinct printing (this exact URL, `/card/dmr/184/wild-growth`, is one specific printing — set `dmr`, collector number 184), cross-linked to every other printing of the same card.
- **Market prices** (USD/EUR/Tix) — not applicable to jinteki, see §6.
- **External cross-links** — TheGamer's article specifically calls out links to MTGTop8, EDHRec, and Cube Cobra for "competitive/format analysis" — i.e. Scryfall doesn't try to be a deckbuilding/metagame site itself; it links out to specialized ones rather than rebuilding that functionality.
- **Related/cross-linking**: card-to-card links exist principally via (a) the prints/versions list (same card, different printing) and (b) clickable type/keyword/set values that re-run a search (e.g. clicking the type line searches `t:"legendary creature"`), which is a lightweight, low-effort form of "related cards" — browsing by facet rather than a curated "similar cards" widget.

---

## 5. Search syntax (`/docs/syntax`, via secondary sources)

The syntax is a **flat `field:value` grammar** with space-separated terms ANDed together by default, confirmed consistently across all four fetched sources. Concrete operators observed:

| Category | Operators | Example |
|---|---|---|
| Name (default/no prefix) | plain text | `lightning bolt` |
| Type line | `t:` / `type:` | `t:wizard`, `t:"legendary creature"` |
| Oracle/rules text | `o:` / `oracle:`; `fo:` / `fulloracle:` (includes reminder text) | `o:"draw a card"` |
| Colors | `c:` / `color:` — `:`/`>=` = at least, `=` = exactly, `<=` = at most | `c=ur`, `color:white` |
| Color identity | `id:` / `identity:` (also `ci:`, `commander:`) | `id<=esper`, `ci:BUG` |
| Mana value | `mv` / `manavalue` / legacy `cmc` | `mv<=2`, `cmc>3` |
| Power/toughness | `pow`, `tou` | `pow>1 tou=3` |
| Set | `s:` / `set:` (also `e:`) | `s:scg`, `e:mh2` |
| Block | `b:` / `block:` | — |
| Rarity | `r:` / `rarity:` (ordered: common < uncommon < rare < mythic, so comparisons work) | `r>=rare` |
| Format legality | `f:` / `legal:`; also `banned:`, `restricted:` | `f:modern`, `legal:standard` |
| Keyword ability | `keyword:` / `kw:` | `kw:cycling` |
| Special/boolean properties | `is:` | `is:split`, `is:mdfc`, `is:fetchland`, `is:commander` |
| Function/intent tags | `function:`, `otag:` (community-maintained "oracle tags") | `function:removal`, `otag:ramp` |
| Artist | `artist:` | `artist:"john avon"` |
| Flavor text | `flavor:` | `flavor:"text"` |
| Art description | `art:` | `art:"dutch angle"` |
| Prices | `usd`, `eur`, `tix` | `usd>5` |
| Year | `year:` | `year:2023` |
| Uniqueness mode | `unique:cards` \| `unique:prints` \| `unique:art` | controls dedup of multiple printings in results |
| Sort | `order:` (name, cmc, power, toughness, set, rarity, color, released, spoiled, edhrec, usd/eur/tix, artist, penny, review, imageupdated) + `direction:asc\|desc` | `order:edhrec direction:desc` |
| Display mode | `display:` (grid, checklist, full, text) — same as the `as=` URL param from §3 | `display:checklist` |
| Regex | `/pattern/` inside a field | `o:/destroy.*creature/` |
| Card-name self-reference | `~` inside oracle-text search, standing for the card's own name | `o:"whenever ~ attacks"` |
| Negation | `-` prefix on any term | `o:counter -o:"+1/+1 counter"` |
| Boolean OR / grouping | `or`, parentheses | `(t:instant or t:sorcery) f:modern` |
| Comparison operators generally | `<`, `<=`, `=`, `>=`, `>` apply uniformly across numeric/orderable fields (mv, pow, tou, rarity, price, date) | consistent operator vocabulary reused everywhere |

Two structural observations worth carrying over conceptually (not literally, since jinteki's data model is different):

1. **One consistent comparison-operator vocabulary** (`<`/`<=`/`=`/`>=`/`>`, `-` for negate, `field:value` for contains/equals) is reused across every field type, rather than each filter inventing its own syntax. Learning the pattern once transfers everywhere.
2. **The colon/equals distinction** (`:` = "at least"/inclusive for set-valued fields like colors, `=` = "exactly") is a deliberate, documented nuance — worth noting as a *possible* source of confusion Scryfall accepts as a tradeoff for expressiveness, not necessarily something to imitate literally.

---

## 6. Other notable patterns (not one of the three deep-dive pages, but surfaced during research)

- **`/random`** — a dedicated random-card URL that also accepts a `q=` filter (e.g. `/random?q=is:commander` gives a random *legal-as-commander* card). Simple, cheap, and composes with the same query language as everything else rather than being a bolted-on separate feature.
- **Homepage** is described (TheGamer) as "much like Google's" — i.e. dominated by a single search box, minimal chrome, not a curated content homepage. Search is clearly positioned as the primary entry point to the whole site.
- **Format-legality FAQ** as a standalone doc page, linked from wherever legality is shown — a reusable pattern for "this table has values a casual user won't intuit" (jinteki doesn't currently have an analogous ambiguous-status field, but the pattern — a one-line explainer link next to any non-obvious status/label — is generally reusable).

---

## 7. Recommendations for jinteki

Grounded in jinteki's actual stack (Postgres/Prisma + `pg_trgm`, no dedicated search engine, no UI component library — hand-rolled Tailwind, Next.js App Router, `searchParams`-driven state per `PHASE_4_PLAN.md`) and its actual current pages (`src/app/cards/page.tsx`, `src/app/cards/[code]/page.tsx`, `src/app/decklists/page.tsx`, `src/app/decklists/[id]/page.tsx`, `src/lib/search/cards.ts`, `src/lib/search/decklists.ts`). Every recommendation below is checked against what's actually feasible with a plain `WHERE`/`Prisma.sql` query against existing columns — nothing here requires a new search engine or infrastructure.

### Quick wins (small, self-contained, no schema change — good candidates to fold into Phase 5 or do standalone before it)

1. **Add a `keywords` (subtypes) filter to `/cards`.** `Card.keywords` is a `String[]` column that already exists and is already displayed on the detail page ("Subtypes: ..."), but `/cards/page.tsx`'s search form only filters on `faction`/`side`/`type` — keywords aren't filterable at all. Scryfall's advanced search treats keyword/subtype as a first-class facet (`kw:`, and type-line word matching). A `keyword` `searchParams` value with `Prisma.sql`\`${keyword} = ANY("keywords")\`` (array-contains) is a one-column addition to `searchCards()` in `src/lib/search/cards.ts`, mirroring the existing `faction`/`side`/`type` equality-filter pattern exactly — no new index needed for exact-match array containment at 2054 rows.
2. **Make the results page's sort explicit and user-controlled**, mirroring Scryfall's `order=`/`direction=` URL params (§3, §5). Right now `searchCards`/`searchDecklists` hard-code the order (similarity-desc-then-title-asc, or title-asc with no query). Adding an `order` `searchParams` value (e.g. `title`, `faction`, `type`) with a small dropdown, defaulting to current behavior, is a URL-param addition consistent with the existing "searchParams are the entire source of truth" architecture note in `cards/page.tsx` — no client JS needed, same `<form method="get">` pattern already in use.
3. **A "Display As" grid/list toggle on `/cards`**, Scryfall's single highest-value, lowest-cost UX idea (§3). jinteki's `/cards` is currently a plain text `<ul>` — no card images anywhere in the list, only on the detail page. Since `getCardImageUrl()` and NRDB's `latest_printing_images.nrdb_classic.small`/`tiny` sizes already exist (per `agent-reports/phase-4.md`), a grid view is just: same `searchCards()` data, a different `<ul>`→`<div className="grid ...">` rendering branch keyed off a `view` searchParam (`grid`|`list`, defaulting to one), each cell an `<img>` (small/tiny size, matching the existing "hotlink, no `next/image`" decision) + title. No new query, no new dependency — purely a rendering-mode toggle on data already fetched. This directly fixes the "no card-image grid view" gap called out in this task's own background section.
4. **Random card link.** `/random` redirecting to a random `Card.code`'s detail page (`ORDER BY random() LIMIT 1`, or cheaper: pick a random offset against the known row count) is a trivial route to add and a nice low-effort discovery affordance, same spirit as Scryfall's `/random`.

### Fits naturally into Phase 5 (rules glossary, right-click integration, favorites, nav — the phase already planned)

5. **Cross-link card facets to searches, the way Scryfall's clickable type/keyword values do (§4).** `PHASE_5_PLAN.md`'s right-click `CardReference` component and the detail page already show faction/type/side/keywords as plain text. Making each of those a link to `/cards?faction=X` / `/cards?type=Y` / `/cards?keyword=Z` (once recommendation #1 exists) is nearly free once the component is being built anyway, and mirrors Scryfall's lightweight "browse by facet" substitute for a dedicated "related cards" feature — no new backend logic, just `<Link>` instead of `<span>` in a component Phase 5 is building regardless.
6. **Rules-glossary legality/status-style explainer pattern (§6).** Not literally applicable (jinteki has no legal/banned concept), but the *pattern* — a one-line "what does this mean?" link next to a non-obvious status — is directly reusable for the right-click rulings popover's `nsgRulesTeamVerified` boolean on `Ruling` (currently a bare column with no UI surfaced yet, per the schema). A one-word badge ("NSG-verified") plus a tooltip/link explaining what that means, in the same popover Phase 5 is already building, costs little and closes a real "casual user won't intuit this" gap the same way Scryfall's legality FAQ does.
7. **Advanced-search-style progressive disclosure for `/rules`.** Phase 5's plan explicitly says rules glossary needs "no structured filters... the rules doc doesn't have equivalent facets" — that's correct, RuleSection has no facet columns. No action needed here; noted only to confirm Scryfall's faceted-filter pattern genuinely doesn't transfer to this one jinteki page, unlike cards/decklists.

### Bigger lift / future phase (real but non-trivial work; don't block Phase 5 on these)

8. **A real "Advanced Search" form for `/cards`, structurally like Scryfall's (§2), once more facets exist.** Once #1 (keywords) lands, jinteki will have faction/side/type/keyword/free-text — already close to a small version of Scryfall's grouped form. The valuable structural idea to borrow is **not** Scryfall's specific 15+ fields (most don't apply — no mana cost/power/toughness/colors in Netrunner's data model) but the **"form and query string are the same underlying model"** principle (§2): if jinteki ever adds a free-text mini-syntax (e.g. `faction:anarch keyword:virus`) parsed server-side, the existing `<form method="get">` filters and a typed query box could both write to the same `searchParams`, so either entry mode produces the same shareable URL. This is speculative and not clearly worth building given Netrunner's small, well-bounded facet set (unlike Magic's sprawling one) — flagged as something to revisit only if `/cards`' filters grow past what a plain multi-select form can hold.
9. **Decklist filtering parity with cards.** `/decklists` only filters on `identity` + free-text `q` (`src/app/decklists/page.tsx`). Scryfall's set-browsing page (§3) shows that a "browse a bounded collection" page benefits from the same faceted filtering as global search (a set page is just filtered search, §3's closing point). A natural Phase 5-or-later extension: filter decklists by identity's `factionCode` (via the existing `Decklist.identity` relation) or by whether a decklist contains a specific card (would need a new indexed query against `DecklistCard`, a bigger lift than #1 since it's a join against a 74k-row junction table, not a flat column — worth an `EXPLAIN` check per `PROJECT_PLAN.md`'s verification standards before shipping).
10. **Card-to-card "appears together in decklists" or "same faction/type" related-card widget** on `/cards/[code]`. Loosely analogous to Scryfall's prints/versions cross-linking, but there's no printings concept in jinteki (see §8 below) — the honest Netrunner-shaped equivalent would be "other cards in the same faction" or "decklists most often pairing this card with X," the latter requiring a real aggregate query over `DecklistCard` (`GROUP BY` co-occurrence) that doesn't exist today. Worth a future phase, not urgent — Scryfall's version exists because Magic cards *have* meaningful multiple printings; jinteki's motivating use case (co-occurrence) is different and would need new query logic, not a schema borrow.

---

## 8. What Scryfall does that should be deliberately skipped, not copied

- **Prices (USD/EUR/Tix), price-based sort/filter, price history.** Netrunner cards aren't traded on a market the way Magic singles are (no meaningful secondary-market price data exists for NRDB to source, and jinteki has no price column or sync). Skip entirely — not a gap, a non-goal.
- **Multiple-printings-per-card / "Show all prints" version pages.** `agent-reports/phase-4.md` already confirmed jinteki's schema deliberately has **no `Printing` model** — NRDB's abstracted `cards` resource is one row per logical card, not per printing, and illustrator/per-printing flavor-text data was never synced for exactly this reason. Scryfall's entire prints/versions section, language-per-printing selector, and "which specific printing is this URL" addressing scheme (`/card/dmr/184/...`) assumes a many-printings-per-card data model jinteki explicitly opted out of. Building this would require a new sync + schema change well outside search/UX scope — don't chase it.
- **External links to third-party competitive-metagame sites (MTGTop8/EDHRec/Cube Cobra equivalents).** Scryfall's rationale ("don't rebuild deckbuilding/metagame tools, link out instead") doesn't obviously map to a Netrunner equivalent worth chasing now — jinteki already has its own decklist browsing built in-house (`/decklists`), which is closer to Scryfall + EDHRec combined than to Scryfall alone. No action needed; noted so it's clear this was considered, not missed.
- **Community tagging (`otag:`/`function:` Oracle Tags).** A crowdsourced tagging layer is a multi-year community-maintenance effort for Scryfall; nothing in jinteki's single-admin-sync, no-user-generated-content model (`PROJECT_PLAN.md`: users can browse/favorite, not author content) supports or needs an equivalent. Skip.
- **Regex search (`/pattern/`) and other power-user syntax minutiae.** Fine for Magic's enormous, decades-deep card pool where exact substring/wildcard matching genuinely matters at scale; jinteki's `pg_trgm` fuzzy-match approach is already a deliberate simplification for a much smaller, well-bounded 2054-card pool (`PROJECT_PLAN.md`: "the search space is well-bounded and doesn't need relevance-tuning infrastructure"). Don't add regex/wildcard syntax parsing on top of trigram search — it fights the architecture's own stated rationale.
- **Multi-language card printings / language selector.** NRDB's data (and jinteki's sync) is English-only as far as this research could tell from the schema (no `language` column on `Card`). Not worth pursuing unless NRDB's own data ever expands to cover it.

---

## Key jinteki files referenced

- `plans/PROJECT_PLAN.md`, `plans/PHASE_4_PLAN.md`, `plans/PHASE_5_PLAN.md`, `agent-reports/phase-4.md`
- `src/app/cards/page.tsx`, `src/app/cards/[code]/page.tsx`
- `src/app/decklists/page.tsx`, `src/app/decklists/[id]/page.tsx`
- `src/lib/search/cards.ts`, `src/lib/search/decklists.ts`, `src/lib/search/types.ts`, `src/lib/search/pagination.ts`
- `prisma/schema.prisma` (in particular `Card.keywords`, `Ruling.nsgRulesTeamVerified`, `RuleMapping`/`RuleSection`, `DecklistCard`)
- `package.json` (confirms no UI component library; Next 16 / React 19 / Tailwind 4 / Prisma 6 / Vitest 4)
