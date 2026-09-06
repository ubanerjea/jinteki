# jinteki — Simple Search Syntax

Archived after Phase 12 shipped. Build spec remains `plans/PHASE_12_PLAN.md`
(section 1).

Not a numbered phase on its own. Companion to `plans/SIMPLE_CARD_SEARCH_PLAN.md`
and `plans/ADVANCED_CARD_SEARCH_PLAN.md`: this is the query language inside the
simple-search box, not a new page.

Research baseline (read before building):
`agent-reports/simple-search-syntax-current-state.md`.

## The disconnect

Phase 11 documented `format=standard` / `banned=1` as **advanced-results query
params** with no simple-search prefix (`plans/PHASE_11_PLAN.md` §2b, and
explicitly out of scope: “Simple-search prefixes for banned or set (`b:`,
`e:`)”). That is also how `/cards/syntax` is written.

The box at `/cards?q=format%3Astandard` does not apply a format filter because
`extractOperators()` in `src/lib/search/cards.ts` only folds four letters:

```
OPERATOR_TOKEN = /^(f|t|s|d):(\S+)$/i
OPERATOR_FIELD = { f: faction, t: type, s: keyword, d: side }
```

`format:standard` is therefore residual `q` and is searched as always-on fuzzy
title-**or**-text. `searchCards()` **does** already honour a URL param
`format=` (current-pool membership via `buildFacetConditions`). Advanced
results uses that same helper. `banned` is worse: it exists only on
`searchCardsAdvanced()`; even `/cards?banned=1` is ignored.

Power-user syntax that already works — `f:anarch t:program`, `f:anarch virus`,
type-ahead on those four letters — is the model to extend, not replace.

## Scope

Simple search only: the `q` box on `/`, `/cards`, and the Simple search field
on `/cards/advanced` (all already submit to `/cards`). Plus rewrite
`/cards/syntax` so it documents what this plan ships.

Out of scope (do not touch):

- Advanced Card Name / Card Text prefix parsing (still literal).
- A visible Banned picker on `/cards/advanced`.
- Decklist / rules search syntax.
- Quoted phrases, regex, numeric comparisons (`o:`, `p:`, …), flavor (`a:`).
- NRDB illustrator (`i:` in NRDB). This plan uses `i:` for **title**.
- Schema, sync, or GIN indexes.
- New npm parser library — recursive descent in this repo.

## Decisions

1. **Every simple-search operator has a short form and a long form**, case-
   insensitive on the prefix, documented as a pair. Type-ahead inserts the
   **code** (same as today: `f:ana` → `f:anarch `), never the display name.
2. **Keep the compact tokens working.** `f:anarch virus` stays faction Anarch
   AND residual `"virus"`. `f:anarch t:program` stays AND of two prefixes.
   Optional whitespace after the colon is also accepted (`f: anarch`).
3. **Space-separated terms are AND.** Explicit `AND` / `OR` / `&` / `|` with
   spaces around the operator; parentheses for grouping; `!` for negation.
4. **`banned` moves onto the simple engine**, sharing one SQL helper with
   advanced. It still requires a format (prefix or URL). Values are yes/no
   (and `1`/`0`), not a ban-list id.
5. **Set and cycle are schema-ready** (Phase 11 `Pack` / `Cycle`). Any-
   printing, same as `pack=`: `card_set_ids` containment, not `packCode`.
   Cycle = packs with that `Pack.cardCycleId`, then the same containment.
   Do **not** read untyped `Card.raw.attributes.card_cycle_ids`.
6. **First-prefix-wins is revoked.** `f:anarch f:criminal` becomes AND (0
   cards, a card cannot be both). Two factions is `f:anarch | f:criminal`.
   Call this out on the syntax page; it is the one intentional break with
   today’s copy.
7. **URL facet params still win** over the same field in `q` (existing
   `?faction=nbn&q=f:anarch` → NBN, token consumed). Banner still reads raw
   URL params only, so `q=format:standard` does **not** grow a “filtered by”
   note — the token is visible in the box, same as `f:anarch` today.

## Operator table

Longest-prefix match is mandatory (`title:` is not `t:` + `itle:`; `set:` is
not `s:` + `et:`). Sort prefixes by length descending before matching.

| Short | Long | Also accepted | Type-ahead | Value |
|---|---|---|---|---|
| `f` | `faction` | | yes | exact `factionCode` (unchanged: `haas_bioroid`, case-sensitive value) |
| `t` | `type` | | yes | exact `typeCode` |
| `s` | `subtype` | `keyword` | yes | exact `keywords[]` membership |
| `d` | `side` | | yes | `corp` / `runner` |
| `fmt` | `format` | | yes | `Format.id` or `Format.name`, case-insensitive (`format:standard`, `format:Standard`) |
| `ban` | `banned` | `b` | yes (`yes` / `no`) | `yes`/`y`/`1`/`true` → banned; `no`/`n`/`0`/`false` → not banned |
| `e` | `set` | `pack` | yes | see Set / cycle below |
| `cy` | `cycle` | `c` (NRDB’s letter) | yes | see Set / cycle below |
| `i` | `title` | | **no** | phrase against `title` only |
| `x` | `text` | | **no** | phrase against `text` only |

`b` is an alias because `/cards/syntax` currently says “there is no `b:`” and
people will try it. It is **not** NRDB’s ban-*list* id operand.

`i:` is **title**, not NRDB’s illustrator. jinteki has no illustrator data
(`agent-reports/netrunnerdb-ux-research.md` §5). Say so on the syntax page.

Unrecognized prefixes stay residual text, same as today.

### Two value kinds

**Code-valued** (`f` `t` `s` `d` `fmt` `ban`): optional space after the colon,
then one `\S+` token. Following words are a new term. This is what keeps
`f:anarch virus` working.

**Phrase-valued** (`i` `x` `e` `cy`): optional space after the colon, then
everything until a terminator:

- whitespace-surrounded `AND` / `OR` / `&` / `|` (any case on the words)
- `(` or `)` (may sit flush against a term)
- another recognized `prefix:` at a word boundary
- end of string

So `i:sure gamble` is title `"sure gamble"`; `i:sure gamble & f:anarch` is
that title AND Anarch; `e:kala ghoda t:program` is that set AND type Program.

### Set / cycle matching

Live NRDB (fetched 2026-09-05), not the sync comment that called the pack
“Kala Ghoda Shard”:

- Set `kala_ghoda` — name **Kala Ghoda**, `position` 1 (in-cycle), cycle `mumbad`
- Cycle `mumbad` — name **Mumbad**, `position` **10** (this *is* the cycle number;
  Borealis fixture is `position` 32 / `first_printing_id` 32001)

Resolve a set value to one or more `Pack.code`s, then reuse the existing
`card_set_ids` containment (OR if several packs). Match, case-insensitive:

1. exact `Pack.code`
2. exact `Pack.name` (so `e:kala ghoda` / `set:Kala Ghoda` both hit)
3. if the whole value is an integer, `Pack.position` — this is the **in-cycle
   index**, not a global catalog number; `e:1` ORs every pack whose position
   is 1. Document that. Type-ahead inserts the code, which is the intended
   path.

Resolve a cycle value to a `Cycle` row, collect `Pack.code` where
`cardCycleId` matches, same containment. Match, case-insensitive:

1. exact `Cycle.id` (`mumbad`)
2. exact `Cycle.name` (`Mumbad`)
3. integer → `Cycle.position` (`cy:10` = Mumbad)

Unknown value → the predicate matches nothing (same as `f:anar` today). Do
not mine `legacy_code` out of `raw` (`kg`, etc.) — not a column, not asked.

### Format + banned

`format:standard` is current-pool membership, same SQL as `?format=standard`
(613 in Standard as of Phase 11; **re-count at build**).

`banned:yes` / `ban:no` use the same restriction JSONB as advanced
(`raw.attributes.restrictions.banned` vs `Format.activeRestrictionId`).
Requires a format from, in order: a format term in the same query, else URL
`format=`. Without a format: `banned:yes` matches nothing, `banned:no` is a
no-op — same as advanced’s `banned=1` without `format`. Restricted / points
cards stay in on `banned:no`; they are still legal.

Lift the banned SQL out of `searchCardsAdvanced` into a helper both engines
call. `parseCardSearchParams` should also read URL `banned` so
`/cards?format=standard&banned=1` works, not only the prefix form.

Supported happy path in the box: `format:standard banned:yes`.

## Grammar

No new dependency. New module e.g. `src/lib/search/query-syntax.ts`:
registry, tokenizer, recursive-descent parser, AST. `extractOperators()` is
replaced; `parseCardSearchParams()` still owns URL params + page size.

```
query   := or
or      := and ( OR and )*          # OR / |
and     := not ( AND? not )*        # AND / & / implicit space
not     := "!" not | primary
primary := "(" query ")" | term
term    := prefix-term | text-phrase
```

- AND (including implicit space) binds tighter than OR.
- `!` attaches to the next term or group: `!f:anarch`,
  `f:anarch AND !t:program`, `!(t:program | t:resource)`.
- `&` / `|` are infix operators and **must** have spaces on both sides
  (`t:program|t:resource` is **not** OR; it is a type code that will not
  match). `AND` / `OR` are the same, any case, as whole tokens.
- A query whose only token is the word `and` / `or` is residual **text**,
  not a missing-operand error — otherwise `q=and` would break.
- Unmatched parens or a dangling `&` / `|` → the query matches nothing
  (do not silently search the punctuation as text).
- Consecutive residual words with no boolean between them stay **one
  phrase** (`sure gamble` is still one substring, not AND of two words).
  `sure | gamble` is OR of two text terms. `sure AND gamble` is AND of two
  text terms.

Text terms (`i:`, `x:`, residual) use simple search’s existing always-on
`word_similarity` **OR** `ILIKE` (`plans/SEARCH_MATCHING.md`), restricted to
one column for `i:` / `x:`. Residual is still title **or** text.

Compile the AST to one `Prisma.sql` fragment (parameterized, never
`$queryRawUnsafe`). AND it with `buildFacetConditions()` of the **URL**
facets only — do not also flatten `q` into `CardSearchParams.faction` and
run both, or you will double-filter.

Ranking: if the AST has any text terms, `GREATEST` of those
`word_similarity`s (title-only terms only score title, etc.). Facet-only
queries stay `title ASC` unless `order=` is set.

## Type-ahead

`src/components/simple-search-box.tsx` + `src/lib/search/prefix-options.ts`.

- `PREFIX_FIELD` / `PREFIX_TOKEN` gain every completable short **and** long
  form. **Do not** add `i` / `title` / `x` / `text`. The existing test that
  `findPrefixToken("x:foo")` is `null` stays green.
- `valueStart` is `start + prefix.length + 1`, not hardcoded `start + 2`.
  `faction:` must complete; a one-letter assumption would splice into the
  word `faction`.
- Optional `!` immediately before the prefix still opens the menu (`!f:`).
- If the caret is on a bare word and the previous token is a completable
  `prefix:` with a trailing space (`f: ana`), complete that field — so
  `f: anarch` is typeable, not only `f:anarch`.
- `getPrefixOptions()` adds: formats (`id` / `name`), packs (`code` /
  `name`), cycles (`id` / `name`), banned (`yes` / `no`). Completions still
  splice `option.value` plus a trailing space.
- No-JS fallback unchanged: plain `<input name="q">`.
- Cap still 8 suggestions; match label or value, case-insensitive.

## Syntax page

Rewrite `src/app/cards/syntax/page.tsx` so it documents **only what this
plan ships**. In particular:

- Prefix table becomes short + long (+ aliases) + example + type-ahead
  yes/no. Worked counts re-derived against the live DB at build, not copied
  from this file (Phase 11’s 613 / 29 / 584, Phase 6’s 253 / 27, etc.).
- New sections: boolean logic (space AND, `AND`/`OR`/`&`/`|`, parens, `!`),
  title/text operators, set/cycle, format/banned in the **simple box**.
- Delete “these are not simple-search prefixes — there is no `b:`”. Advanced
  results URLs `format=` / `banned=` still work; they are no longer the only
  way. Keep a one-liner that the same filters exist as query params on
  `/cards/advanced/results`.
- Drop negation, OR, `x:` / `e:` from “Not supported”. Keep quoting, regex,
  numeric operands, flavor, illustrator.
- State the `f:anarch f:criminal` meaning change.
- State `i:` ≠ NRDB illustrator.
- State `&`/`|` need spaces; `t:program|t:resource` does nothing special.

Home-page hint (`f:anarch virus`) can stay; it remains valid.

## Testing

Parser unit tests (no DB) in `query-syntax.test.ts`:

- Existing four prefixes, long forms, mixed case on the prefix letter.
- `f:anarch virus` → faction + residual `"virus"`.
- `f: anarch` (space after colon) ≡ `f:anarch`.
- `faction:anarch` ≡ `f:anarch`; `title:` is not parsed as `t:`.
- `format:standard`, `banned:yes`, `set:kala_ghoda`, `e:kala ghoda`,
  `cy:mumbad`, `cy:10`.
- `f:anarch & (t:program | t:resource)`, `!f:anarch`,
  `f:anarch AND !t:program`.
- Unmatched `(` → empty match marker / parse error.
- `x:foo` is a text operator, not residual `"x:foo"` (this **updates**
  today’s `parseCardSearchParams({ q: "x:foo bar" })` test).

Real-DB tests in `cards.test.ts` (re-count, do not hard-code this plan’s
numbers into asserts without querying):

- `q=format:standard` equals `?format=standard` (current pool).
- `q=format:standard banned:yes` equals advanced `format=standard&banned=1`
  and `getFormatCardStatus`’s banned codes (29 as of Phase 11).
- `q=format:standard banned:no` equals pool minus banned (584 as of Phase 11).
- `q=f:anarch t:program` and `q=f:anarch virus` totals unchanged from today.
- `q=faction:anarch` equals `q=f:anarch`.
- `q=!f:anarch` equals total − Anarch.
- `q=f:anarch | f:criminal` equals the union of each alone.
- `q=i:<a title-only word>` vs `q=x:<the same word>` vs residual `q` —
  pick a real word like `virus` (syntax page already pins title 3 / text 78 /
  simple wider).
- `q=e:kala_ghoda` (and `e:kala ghoda`) equals `?pack=kala_ghoda`.
- `q=cy:mumbad` (and `cy:10`) equals cards whose `card_set_ids` overlap
  Mumbad’s packs.

`simple-search-box.test.ts`: long-form `faction:` valueStart; `format:` /
`e:` / `cy:` / `ban:` open; `x:` / `i:` / `title:` still `null`.

Advanced banned tests keep passing against the shared helper.

## Verification

`PROJECT_PLAN.md` standards: `tsc --noEmit`, lint, `pnpm test`, `pnpm dev` +
curl, and a separate `next build` + `next start` + curl (routes change). No
schema/migration. No `$queryRawUnsafe`.

Curl (expected counts re-derived via `psql` the same day, not copied):

- `/cards?q=format:standard` — same total as `/cards?format=standard` and as
  `/cards/advanced/results?format=standard`.
- `/cards?q=format:standard%20banned:yes` — same 29 codes as advanced
  `banned=1`.
- `/cards?q=f:anarch+virus` — still the current Anarch+virus-text total;
  box `value` is the raw `q`; no “filtered by” banner.
- `/cards?q=f:anarch+%7C+f:criminal` — union, not first-wins Anarch.
- `/cards?q=e:kala+ghoda` and `/cards?q=cy:mumbad` — non-zero, equal to the
  direct pack/cycle SQL.
- `/cards/syntax` — grep that `format:standard` appears as a **prefix**
  example, that the “there is no `b:`” sentence is gone, and that `!` / `OR`
  / `title:` / `set:` are documented.

Type-ahead dropdowns need a real browser; curl cannot prove them. Unit tests
cover token detection / splice; say that gap in the task report.

After verification: `agent-reports/simple-search-syntax.md`.
