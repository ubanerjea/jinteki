# Simple card search syntax — current state

Research only. Primary sources: `src/lib/search/cards.ts`, `src/lib/search/cards-advanced.ts`, `src/app/cards/syntax/page.tsx`, `src/components/simple-search-box.tsx`, `src/lib/search/prefix-options.ts`, `src/lib/search/cards.test.ts`, `src/app/cards/page.tsx`, prisma schema, and existing tests/fixtures. Phase 6 / 7 / 11 plans and reports used as pointers, then re-checked in code.

## 1. The disconnect (one paragraph)

`format:standard` typed in the simple box becomes the URL `/cards?q=format%3Astandard` and does **not** apply a format filter, because the simple parser only folds four single-letter prefixes out of `q`. `extractOperators()` matches `OPERATOR_TOKEN = /^(f|t|s|d):(\S+)$/i` and maps those letters onto `faction` / `type` / `keyword` / `side` (`src/lib/search/cards.ts`). A token whose left-hand side is `format` is therefore **not** an operator: it stays in residual `q` and is searched as always-on fuzzy title-**or**-text (`${q} <% title OR title ILIKE … OR ${q} <% text OR text ILIKE …`). `parseCardSearchParams()` **does** read a separate URL query param named `format` (`firstParam(input, "format")`) and `searchCards()` **does** pass it into `buildFacetConditions()`, which looks up `Format.id` and filters `raw.attributes.card_pool_ids` against that format’s `activeCardPoolId`. The advanced results URL `/cards/advanced/results?format=standard` hits `parseAdvancedCardSearchParams()` → `searchCardsAdvanced()` → the same `buildFacetConditions()`, so the filter applies. Same split for banned: `/cards?q=banned%3A1` (or even `/cards?banned=1`) does nothing special — `CardSearchParams` has no `banned` field, `parseCardSearchParams` never reads `banned`, and `searchCards()` never emits the restriction SQL. `banned=1` only exists on the advanced engine (`AdvancedCardSearchParams.banned`, `validBanned()`, applied in `searchCardsAdvanced()` only when `format` is also set). The syntax page already documents this: prefixes are simple-search-only; `banned=1`/`banned=0` are “not simple-search prefixes” and “only apply on advanced results URLs.”

## 2. Inventory of every simple-search / card-search predicate

Recognition keys:

- **q-prefix** — token inside the `q` box, parsed by `extractOperators()`.
- **URL /cards** — `parseCardSearchParams()` / `searchCards()`.
- **URL /cards/advanced/results** — `parseAdvancedCardSearchParams()` / `searchCardsAdvanced()`.
- **Type-ahead** — `PREFIX_TOKEN` / `PREFIX_FIELD` in `simple-search-box.tsx`.

| Predicate | Short prefix | Long-form q prefix | URL param | Recognized where | Value matching | Type-ahead | SQL / filter meaning | Unknown / partial | Repeating same prefix |
|---|---|---|---|---|---|---|---|---|---|
| Free text (simple) | *(none)* | n/a | `q` | q-box + URL `/cards` | Residual after prefixes is **one** string; `word_similarity` (`<%`) **OR** `ILIKE` substring on **title OR text**; always fuzzy; `likePattern()` escapes `%` `_` `\` | No | `q <% title OR title ILIKE … OR q <% text OR text ILIKE …` | Empty/blank → no text filter. Literal `format:standard` / `x:foo` is this path. | n/a (one `q`; repeated URL `q` takes first via `firstParam`) |
| Title (advanced) | none | none (`title:` is **not** an operator) | `title` | Advanced-only | Pure literal substring on `title`; fuzzy opt-in via `fuzzy=1` | No (and must stay out of type-ahead if added as syntax later) | `title ILIKE` or `ILIKE OR term <% title` | Searched as characters; `title=f:anarch` looks for those characters, 0 cards | Single value (`firstParam`) |
| Text (advanced) | none | none (`text:` / `x:` not operators) | `text` | Advanced-only | Same as title, column `text` | No | Same pattern on `text` | Same | Single value |
| Faction | `f:` | **not implemented** (`faction:` left as residual `q`) | `faction` | q-prefix **and** URL on both engines | Exact `factionCode` equality; **case-sensitive value**; prefix **letter** is case-insensitive (`F:anarch` works, `f:ANARCH` does not). No spaces (`f:haas bioroid` → faction `haas` AND residual `bioroid`). Underscored code (`haas_bioroid`). | Yes (`f:` / `F:`) | `"factionCode" = $1` (simple); advanced multi: `= ANY($1)` | Partial `f:anar` → 0 rows. Unknown code → 0 rows. Token still consumed. | First q-token wins; later `f:` still stripped. URL `faction=` beats q-token. Advanced picker: several values = OR. |
| Type | `t:` | **not implemented** | `type` | q-prefix + URL both engines | Exact `typeCode` (`ice`, `corp_identity`, …), same case/space rules as faction | Yes | `"typeCode" = $1` / `= ANY` | Same as faction | Same first-wins / URL-wins / advanced OR |
| Subtype (keywords) | `s:` | **not implemented** | `keyword` | q-prefix + URL both engines | Exact membership in `Card.keywords` (`String[]`); code not display name (`code_gate`) | Yes | `'virus' = ANY("keywords")`; several → `"keywords" && $1` (overlap / OR) | Unknown subtype → 0 | Same |
| Side | `d:` | **not implemented** | `side` | q-prefix + URL both engines | Exact `sideCode` (`corp` / `runner`) | Yes | `"sideCode" = $1` (simple is scalar-only; advanced also scalar) | Unknown → 0 | First-wins in q; URL wins |
| Set / pack | **none** (`e:` is documented as unsupported NRDB prefix) | **none** (`set:` not parsed) | `pack` | URL both engines; **no q-prefix**. Advanced Set picker; `/cards` still honors inbound `pack=` (no widget) | Exact pack **code** (`core_set`, `system_gateway`, `kala_ghoda`) against JSONB `raw.attributes.card_set_ids` (any printing, not `packCode`) | No | `@> to_jsonb(code)`; several packs OR’d | Unknown code → 0 (containment fails) | Simple: `firstParam` (one). Advanced: `allParams` OR-within-facet |
| Format | **none** (`format:` is residual `q`) | **none** | `format` | URL both engines; **no q-prefix**. Advanced `<select name="format">` uses `Format.id`; `/cards` honors inbound `format=` | Exact `Format.id` (`standard`, `eternal`, `system_gateway`, …), **not** display name. `findUnique({ where: { id } })`. Only **first** format value used even if an array is passed into `buildFacetConditions` | No | Current-pool: `card_pool_ids @> activeCardPoolId`. **Not** historical `format_ids` | Unknown id or null `activeCardPoolId` → SQL `false` (0 rows). Test: `format=not_a_format` total 0 | Simple: one. Advanced: one `<select>` |
| Banned | **none** (syntax page: “there is no `b:`”) | **none** | `banned` | **Advanced-only** URL. Hidden input on `/cards/advanced` to restore inbound value; **no visible picker**. Ignored on `/cards` | Only `"1"` or `"0"`; anything else (`yes`, `true`, blank) → unset (Ignore). **Requires `format`** | No | `raw.attributes.restrictions.banned @> activeRestrictionId` (`banned=1`) or `NOT` that (`banned=0`). Null restriction: `banned=1` → `false`; `banned=0` → no extra condition | Garbage → ignored. `banned=1` without format → unfiltered total (2054 in tests) | n/a |
| Cycle | **none** (`c:` is NRDB-only in the research doc; not implemented) | **none** | **none** (no `cycle=` param anywhere in `src/`) | nowhere | n/a | No | n/a | n/a | n/a |
| Sort | none | none | `order` | URL both engines | Own-property lookup in `ORDER_COLUMNS`: `title`, `faction`, `type` | No | `ORDER BY <col> ASC, title ASC`. Absent/invalid → relevance if `q` else title | Unrecognized / prototype keys ignored | firstParam |
| Fuzzy (advanced) | none | none | `fuzzy` | Advanced-only | Exactly `"1"` is on; `"on"`/`"true"`/`"0"` are off | No | Adds `<%` / `word_similarity` to title/text conditions | n/a | n/a |
| Pagination / view | none | none | `page`, `pageSize`, `view` | presentation | `pageSize` ∈ {30,60,100} | No | LIMIT/OFFSET; view is UI | invalid pageSize → default 30 | n/a |

### How `q` is submitted

- Home (`src/app/page.tsx`): GET `action="/cards"`, `SimpleSearchBox name="q"` only.
- `/cards` (`src/app/cards/page.tsx`): GET form, `name="q"`, `defaultValue={firstParam(rawParams, "q")}` (raw query, **not** residual `params.q`). Hidden inputs re-carry `view`, `order`, `pageSize`, and inbound **URL** facets (`FACET_PARAMS`: faction, side, type, keyword, pack, format) — so a followed `?faction=nbn` link survives re-search, but a prefix folded from `q` is **not** written as a hidden `faction=` (the token stays in the box).
- Advanced page’s “Simple search” box (`src/app/cards/advanced/page.tsx`): separate form, `action="/cards"`, `name="q"` — same simple engine. The criteria form posts to `/cards/advanced/results` with `title` / `text` / pickers; those two text fields do **not** run `extractOperators()`.

## 3. Facets that exist as URL/advanced filters but have no simple-search prefix

| Facet | Engine today | Missing piece |
|---|---|---|
| **format** | `searchCards()` already accepts `format` and filters current pool | Prefix folding only (`format:` / maybe a short letter). URL `/cards?format=standard` already works. |
| **pack / set** | `searchCards()` already accepts `pack` (any-printing `card_set_ids`) | Prefix folding only (`e:` / `set:`). URL `/cards?pack=core_set` already works. Phase 11 explicitly deferred “Simple-search prefixes for banned or set (`b:`, `e:`)”. |
| **banned** | **Advanced engine only.** Not on `CardSearchParams` / `searchCards()` | New predicate on the simple path *and* a prefix, or a decision to keep it advanced-only. Requires `format`. |
| **title** | Advanced `title=` only | Simple `q` already ORs title with text; a `title:` / `i:`-style split would change residual semantics. |
| **text** | Advanced `text=` only | Same; NRDB’s `x:` is currently residual literal (`x:foo` stays in `q`). |
| **cycle** | **No URL param, no filter, no prefix** | New facet in `buildFacetConditions` (or equivalent) plus parser + optional prefix. Schema already has `Cycle` + `Pack.cardCycleId` (see §4). |

## 4. Schema notes for `e:` / `set:` and `cy:` / `cycle:`

### Pack (NRDB `card_sets`)

`prisma/schema.prisma` `model Pack`: `code` (PK, NRDB card_set id), `name`, `dateRelease`, `size`, `cardCycleId`, `cardSetTypeId`, `position`, `raw`. Mapper (`mapPack` in `src/sync/sync-factions-packs.ts`): `code: resource.id`, `name: attributes.name`, `position: attributes.position ?? null`.

There is **no** separate numeric “set number” column beyond `Pack.position` (position **within the cycle**, nullable). Fixture `card-set-parhelion.json`: `id: "parhelion"`, `name: "Parhelion"`, `position: 3`, `card_cycle_id: "borealis"`, and in **raw only** `legacy_code: "ph"` — `legacy_code` is **not** a Prisma column.

### Cycle (NRDB `card_cycles`)

`model Cycle`: `id` (PK, e.g. `"borealis"`), `name`, `dateRelease`, `position`, `raw`. Mapper: `id: resource.id`, `name: attributes.name`, `position: attributes.position ?? null`. Fixture `cycle-borealis.json`: `id: "borealis"`, `name: "Borealis"`, `position: 32`, `legacy_code: "borealis"` (raw only), `card_set_ids: ["midnight_sun_booster_pack", "midnight_sun", "parhelion"]`. Fixture `cycle-vantage-point.json` mapped in tests: `id: "vantage_point"`, `name: "Vantage Point"`, `position: 35`.

### How cards relate

- `Card.packCode` → original-printing heuristic: **last** entry of `raw.attributes.card_set_ids` (`sync-cards.ts`).
- Any printing: JSONB `raw->'attributes'->'card_set_ids'` (what `pack=` already uses).
- `Card` has **no** `cardCycleId` column and no Cycle relation.
- `Pack.cardCycleId` → `Cycle.id` is the typed cycle link.
- `CardAttributes` types `card_set_ids: string[]`. A comment on the cards resource says `card_set_ids` / `card_cycle_ids` list printings, but `card_cycle_ids` is **not** a typed field on `CardAttributes`; the field that **is** typed as `card_cycle_ids` is `CardPool`. Do not assume `Card.raw.attributes.card_cycle_ids` without a live-row check.

### Sample identities (from fixtures / comments, not invented columns)

- **Kala Ghoda**: card fixture `card-with-subtypes.json` has `card_set_ids: ["kala_ghoda"]`. Sync comment names the pack “Kala Ghoda Shard”. Matching by **code** today would be `pack=kala_ghoda`. Matching by **name** would need `Pack.name` (spaces → current whitespace tokenizer would split). Matching by **position** would be `Pack.position` if present (often null — `double_time` fixture has `position: null`).
- **Mumbad**: appears as a **cycle id** `"mumbad"` in card-pool fixtures (`card-pool-rotation.json` `card_cycle_ids`). That is `Cycle.id`, not a pack code.

### Can `e:`/`set:` and `cy:`/`cycle:` be implemented without a new sync?

**Yes, for code-based matching**, from data already synced:

- **Set by code**: reuse existing `pack=` / `card_set_ids` containment. No sync.
- **Set by name**: `Pack.name` is already a column; would need a lookup (and a quoting/spaces story the current tokenizer does not have).
- **Set by in-cycle position**: `Pack.position` exists but is nullable and is not a unique id.
- **Set by v2 short code** (`ph`, `core`): only inside `Pack.raw` as `legacy_code` in fixtures — **not** a column; would be JSONB mining or a new column/sync.
- **Cycle by id**: join packs with `cardCycleId = Cycle.id`, then cards whose `card_set_ids` overlap those pack codes (any printing, consistent with current `pack=`). Original-only would use `Card.pack.cardCycleId` instead — different result set (Phase 11 already showed `packCode = system_gateway` → 75 vs `card_set_ids` → 77).
- **Cycle by name**: `Cycle.name` (spaces: “Vantage Point”).
- **Cycle by position**: `Cycle.position` is the cycle’s order in the game line (Borealis **32**), not Magnum Opus-style set numbers.

No product choice is made here; those matching axes are what the columns actually are.

## 5. Type-ahead coupling

Wired **tightly** to the four letters `f` / `t` / `s` / `d`:

- `PREFIX_FIELD = { f: "faction", t: "type", s: "keyword", d: "side" }`
- `PREFIX_TOKEN = /^(f|t|s|d):(\S*)$/i` — looser than `OPERATOR_TOKEN` (`\S*` vs `\S+`) so a bare `f:` opens the menu
- `PrefixOptionMap` has only those four keys
- `getPrefixOptions()` loads factions, typeCodes, unnested keywords, static `["corp","runner"]` — **not** packs, formats, or cycles
- `findPrefixToken()` sets `valueStart: start + 2` — **hardcoded single-letter prefix** (letter + colon)
- Tests: `x:foo` → `null`; lone `f` without colon → `null`; caret off the token → `null`

To add **long-form** (`faction:`, `format:`) and **new short** (`e:`, `cy:`) while **excluding** `i:` / `x:` / `title:` / `text:` from type-ahead:

1. Change `PREFIX_TOKEN` / `PREFIX_FIELD` (and likely `valueStart` to `start + prefixLength + 1`) independently of `OPERATOR_TOKEN`. Parser and type-ahead are already two regexes; they can diverge.
2. Extend `PrefixOptionMap` + `getPrefixOptions()` with the lists that should complete (e.g. `Format.id`/`name`, `Pack.code`/`name`, `Cycle.id`/`name`). Pack/format queries already run on the advanced form page only; simple pages would need those lists if type-ahead is offered there.
3. Do **not** add `i`/`x`/`title`/`text` to `PREFIX_*`. If the parser later treats `x:` as an operator, type-ahead still stays closed unless `PREFIX_TOKEN` is updated — that is the exclusion mechanism.
4. Completions splice the **code** (`option.value`), not the label; matching is case-insensitive substring on label **or** value; max 8 rows.

`extractOperators` does not currently know long names: `faction:anarch` is residual `q`, same as `format:standard`.

## 6. Boolean / residual-text semantics (must not silently break)

Documented on `/cards/syntax` and implemented in `extractOperators` + `searchCards`:

| Rule | Today |
|---|---|
| Space-separated **recognized prefixes** | **AND** across fields (`f:anarch s:virus` → faction AND keyword). Facet conditions joined with `AND`. |
| Residual free text | Tokens that fail `OPERATOR_TOKEN` are joined with spaces into one `q`. Simple search: that string matches **title OR text**, **always fuzzy**. Not split into AND-terms. |
| `f:anarch virus` | Faction `anarch` **AND** residual `"virus"` (whitespace split). Homepage even suggests this example. |
| `f:anarch t:program` | Faction AND type; empty residual. |
| First-prefix-wins | `if (!explicit[field] && !derived[field]) derived[field] = value`. Syntax page: `f:anarch f:criminal` → Anarch; second token still consumed. **No dedicated unit test** (only the `!derived[field]` line + syntax copy). |
| URL param beats q-token | Explicit `faction`/`type`/`keyword`/`side` from URL win; the q-token is still stripped. Test: `q=f:anarch&faction=nbn` → faction `nbn`, `q` undefined. `pack`/`format` are URL-only today, so they cannot conflict with a q-token yet. |
| No OR, no parens, no negation | Syntax “Not supported”: `-f:anarch`, `anarch \| criminal`, `"sure gamble"`, `/^Sure/`, “any other prefix including NetrunnerDB’s” (`x:2`, `a:flavour`, `e:core`). “Only the four prefixes in the table above exist.” |
| Unrecognized prefix | Left as literal text (`x:foo bar` → `q: "x:foo bar"`). Usually 0 cards. |
| `f:` with empty value | Parser requires `\S+`, so `f:` is residual text, not a faction filter. Type-ahead still opens. |
| Advanced vs simple AND/OR | Advanced: OR **within** a multi-value facet, AND across facets; title AND text if both filled. Simple prefixes cannot OR two factions. |

A new grammar that tokenizes differently (e.g. treating every word as AND, or parsing `format:` as an operator) must keep `f:anarch virus` and `f:anarch t:program` meaning what they mean now.

## 7. NRDB operator letters as already recorded in this repo

From `agent-reports/netrunnerdb-ux-research.md` §5 (mirror `/en/syntax`, not invented here):

| Code | Field (NRDB, as recorded) |
|---|---|
| *(none)* | Card title |
| `x` | Card text |
| `a` | Flavor text |
| `e` | Set/pack |
| `c` | Cycle |
| `t` | Type |
| `f` | Faction (full codes or shorthand) |
| `s` | Subtype (`Card.keywords`) |
| `d` | Side |
| `i` | Illustrator — report notes jinteki has no illustrator data |
| `o` `g` `m` `n` `p` `v` `h` `r` `u` `z` | Cost / adv. cost / MU / influence / strength / agenda points / trash / release date / unique / rotation |
| `b` | Banlist/format (real NRDB; not on the Reboot mirror list) |

NRDB operators recorded there: `:` equals, `!` different-from, `<` / `>`; spaces = AND; `|` = OR; `-`/`!` negate; quoting for multi-word.

`src/lib/search/cards.ts` comment on item 6: maps **NRDB’s own f/t/s/d operand letters** onto existing dropdown fields; **only those four exact prefixes**; `x:foo` left as literal. Same file’s research-era comment in the NRDB doc also maps `e`→`Card.packCode` (today’s `pack=` filter uses `card_set_ids`, not `packCode`). Phase 11 out of scope: simple-search `b:` / `e:`. Syntax page Not supported examples: `x:2`, `a:flavour`, `e:core`.

This repo does **not** record implementing NRDB shorthand factions (`f:n`), `c:` vs `cy:`, or long-form names.

## 8. Source-tagged claims (index)

- Four prefixes only, dropdown/URL wins, residual text: `src/lib/search/cards.ts` `OPERATOR_FIELD`, `OPERATOR_TOKEN`, `extractOperators`, `parseCardSearchParams`.
- Format/pack SQL (shared): `buildFacetConditions` in `src/lib/search/cards.ts`.
- Banned SQL (advanced-only): `searchCardsAdvanced` in `src/lib/search/cards-advanced.ts`; parser `validBanned`.
- Syntax UX contract: `src/app/cards/syntax/page.tsx` (PREFIXES, NOT_SUPPORTED, Precedence, Advanced-results query params).
- Type-ahead four letters + `start + 2`: `src/components/simple-search-box.tsx`; tests `src/components/simple-search-box.test.ts`.
- Option lists: `src/lib/search/prefix-options.ts`.
- Operator parse tests: `src/lib/search/cards.test.ts` describe `parseCardSearchParams - operator syntax (item 6)`.
- q submit + raw defaultValue: `src/app/cards/page.tsx`.
- Advanced simple box posts to `/cards`; criteria form to `/cards/advanced/results`: `src/app/cards/advanced/page.tsx`.
- Inbound facet keys (no banned, no cycle): `FACET_PARAMS` in `src/lib/search/filter-summary.ts`.
- Schema: `prisma/schema.prisma` `Cycle`, `Pack`, `Card`, `Format`.
- Pack/cycle mapping + Kala Ghoda comment: `src/sync/sync-factions-packs.ts`; fixtures under `src/sync/__fixtures__/`.
- `kala_ghoda` as a set id: `src/sync/__fixtures__/card-with-subtypes.json`.
- `mumbad` as cycle id: `src/sync/__fixtures__/card-pool-rotation.json`.
- NRDB letters: `agent-reports/netrunnerdb-ux-research.md` §5.
- `e:`/`b:` deferred: `plans/PHASE_11_PLAN.md` “Explicitly out of scope”; `agent-reports/phase-11.md`.

## 9. Open questions (for the plan author — not decided here)

1. **Which new prefixes?** Long-form only (`format:`, `set:`, `cycle:`), NRDB letters (`e`, `c`, `b`, `x`), both, or aliases (`e:` = `set:`)? `cy:` is not in the NRDB table this repo recorded (`c` is).
2. **Match keys** for set/cycle/format: id/code vs name vs `position` vs raw `legacy_code`? Names have spaces; the tokenizer still splits on whitespace and quoting is explicitly unsupported.
3. **Any-printing vs original** for set/cycle, given `pack=` already uses `card_set_ids` and `packCode` is original-only.
4. **Does `banned:` belong in simple search at all?** It is advanced-only, needs `format`, and Phase 11 deferred `b:`. Values are `1`/`0`, not a banlist id.
5. **Should `searchCards()` gain `banned`, or only fold prefixes that already have simple URL params (`format`, `pack`)?**
6. **Keep first-prefix-wins** when adding fields that advanced ORs (two packs, two factions)? Changing this would also change `f:anarch f:criminal`.
7. **Type-ahead set** vs parse set: long-form `faction:` with type-ahead? `format:`/`e:`/`cy:` with type-ahead? Confirm `i:`/`x:`/`title:`/`text:` stay parse-as-literal **and** no menu.
8. **Hardcoded `valueStart + 2`** must change if any prefix is longer than one character.
9. **Unknown values**: keep applying an exact filter that returns 0, vs leave the token as residual text (today: recognized prefix with bad code → 0; unrecognized prefix → literal search).
10. **`format:standard` in `q` vs `?format=`**: if folded internally like `f:`, the `/cards` “filtered by” banner will **not** show it (banner reads raw URL facet params, not derived tokens). Is that acceptable?
11. **Cycle filter join path** if `Card.raw.attributes.card_cycle_ids` is untyped: verify live JSON before using it; otherwise Pack.cardCycleId + card_set_ids is the schema-backed path.
12. **Residual grammar**: remain “one leftover substring, title OR text, always fuzzy,” or move toward NRDB’s AND-of-terms? The former is load-bearing for `f:anarch virus`.
