# jinteki — Phase 12 Build Plan: Simple Search Syntax, User Decklists, and Decklist Card Hover

## Context

Phase 11 closed format-page card links, sets, and the sectioned decklist layout.
Three leftover gaps, each already written up as a topical plan, are the same
kind of "the data is there, the UI/query language is not" follow-up Phase 11
was for Phase 10:

1. **Simple search syntax** — `plans/SIMPLE_SEARCH_SYNTAX_PLAN.md`. Phase 11
   shipped `format=` / `banned=` as advanced-results query params and
   explicitly deferred simple-search prefixes (`b:`, `e:`). The box still
   only folds `f`/`t`/`s`/`d`. Research baseline:
   `agent-reports/simple-search-syntax-current-state.md`.
2. **User-created decklists** — `plans/USER_DECKLISTS_PLAN.md`. This is the
   piece `PROJECT_PLAN.md`'s Users & Auth section deferred ("user-created
   decklists / a full deckbuilder"). Favorites already exist; owned lists
   do not. This phase builds owned lists. It does **not** build a visual
   deckbuilder.
3. **Decklist card hover image** — `plans/DECKLIST_CARD_HOVER_PLAN.md`.
   `/decklists/[id]` is still a text list even though `card.raw` is already
   loaded and `getCardImageUrl` already resolves the NRDB CDN URL.

This numbered phase is the build spec. The three topical source docs now
live in `plans/archive/` (`SIMPLE_SEARCH_SYNTAX_PLAN.md`,
`USER_DECKLISTS_PLAN.md`, `DECKLIST_CARD_HOVER_PLAN.md`). If a topical doc
and this file disagree, **this file wins** (the identity-`typeCode`
correction in Decisions is the one already known disagreement).

Nothing here touches remote access, deployment, or Phase 11's data model
(`Cycle` / `Pack` columns, current-pool `format=`, advanced `banned=`).

## Baseline read directly against the repo and live data before writing this plan

Confirmed live 2026-09-05, not copied from the topical docs unverified:

- `extractOperators()` in `src/lib/search/cards.ts` is still
  `OPERATOR_TOKEN = /^(f|t|s|d):(\S+)$/i` mapping onto faction / type /
  keyword / side. First-prefix-wins (`f:anarch f:criminal` → Anarch).
  `parseCardSearchParams()` folds those tokens into `CardSearchParams` and
  returns residual `q`. It does **not** read `banned`. `searchCards()`
  honours URL `format=` / `pack=` via `buildFacetConditions()`; it has no
  banned SQL. Banned lives only in `searchCardsAdvanced()`.
- Type-ahead (`src/components/simple-search-box.tsx`) is the same four
  letters; `PREFIX_TOKEN` is `/^(f|t|s|d):(\S*)$/i`; `valueStart` is
  hardcoded `start + 2`. `findPrefixToken("x:foo")` is `null` (test in
  `simple-search-box.test.ts`). `getPrefixOptions()` fetches faction / type /
  keyword / side only.
- `/cards/syntax` documents four prefixes, first-wins, and the sentence
  "These are not simple-search prefixes — there is no `b:`". Not-supported
  still lists negation, OR, and `e:core`.
- `Decklist` columns today: `id`, `name`, `identityCode`, `createdAt`,
  `updatedAt`, `nrdbUserId`, `raw`. **No** `ownerId` / `isPublic` / `notes`.
  `id` has no `@default`. `SELECT count(*) FROM "Decklist"` → **74242**.
  `User` has `cardFavorites` / `decklistFavorites` only — no reverse owned
  relation.
- `/favorites` is a signed-in page listing both favorite kinds. Header
  Favorites → `/favorites`. The username in `site-header.tsx` is inert
  `<span>` text. No `/me`, no `/decklists/new`, no `/decklists/[id]/edit`.
- `searchDecklistsByTab` has no `isPublic` predicate (Recent/updated are
  `FROM "Decklist" d` with only the week-tab date filter).
  `searchDecklistsAdvanced` builds `WHERE` only when `conditions.length > 0`
  — an unfiltered advanced query is `WHERE`-less.
- `/decklists/[id]` loads `identity` + `cards.card`, wraps names in
  `CardReference` + `Link`, shows NRDB byline + "View on NetrunnerDB", and
  a Favorite toggle. No hover component exists (`CardHoverImage` grep is
  empty). `CardReference`'s popover is `z-50`.
- **Identity `typeCode` is not `'identity'`.** Live
  `SELECT DISTINCT "typeCode" FROM "Card"`:

  | typeCode | count |
  |---|---|
  | agenda | 181 |
  | asset | 211 |
  | corp_identity | **81** |
  | event | 223 |
  | hardware | 154 |
  | ice | 317 |
  | operation | 218 |
  | program | 255 |
  | resource | 229 |
  | runner_identity | **67** |
  | upgrade | 118 |

  2054 cards. `typeCode = 'identity'` → **0**. Identities are
  `corp_identity` + `runner_identity` = **148**, and every one of them is
  already used as some decklist's `identityCode`. Synced from
  `attributes.card_type_id` in `sync-cards.ts`. The syntax page already
  documents `t:corp_identity`. The topical user-decklists plan's
  `typeCode = 'identity'` is wrong; this phase uses the two real codes.
- Pack `kala_ghoda`: name **Kala Ghoda**, `position` 1, cycle `mumbad`.
  Cycle `mumbad`: name **Mumbad**, `position` **10**. Six Mumbad packs.
  `card_set_ids` containment: Kala Ghoda **19** cards; Mumbad cycle **114**.
- Format Standard current pool **613**; banned in that pool **29**; pool
  minus banned **584**. Anarch **253**; Anarch+virus-keyword **27**;
  Anarch+program **76**; title `virus` **3**; text `virus` **78**.
- Five `pg_trgm` GIN indexes present (`Card_title_trgm_idx`,
  `Card_text_trgm_idx`, `Decklist_name_trgm_idx`,
  `RuleSection_title_trgm_idx`, `RuleSection_bodyText_trgm_idx`).
- One `User` row in this local DB.

Re-count every pinned number at build/verify time. They move with syncs.

## Decisions (read these before the sections)

1. **Three sections, one phase, one task report** (`agent-reports/phase-12.md`).
   Do not emit `simple-search-syntax.md` / similar per-topic reports.
2. **Identity select is `typeCode IN ('corp_identity', 'runner_identity')`**,
   title + faction, 148 options. Do not query `typeCode = 'identity'`. Do
   not reuse `/decklists/advanced`'s `decklistsAsIdentity: { some: {} }`
   filter — a newly synced identity must be pickable before any deck uses
   it. Re-query `DISTINCT "typeCode"` at build; if NRDB ever adds a third
   identity code, include it.
3. **Header: one destination.** Username links to `/me`. Favorites nav
   `href` becomes `/me`, label stays **Favorites**. `/favorites` redirects
   to `/me` so old bookmarks work. No third URL.
4. **`/decklists/[id]` is the shared surface for sections 2 and 3.** Final
   name tree on identity and every slot:

   ```tsx
   <CardHoverImage src={getCardImageUrl(card.raw, "large")} alt={title}>
     <CardReference code={code}>
       <Link href={`/cards/${code}`} className="underline">{title}</Link>
     </CardReference>
   </CardHoverImage>
   ```

   Hover is **not** a prop on `CardReference`.
5. **Simple-search operators stop being folded into `CardSearchParams`.**
   `extractOperators()` is replaced by an AST. `parseCardSearchParams()`
   owns URL params + page size (and starts reading URL `banned`). `q` is
   the trimmed raw box string, not a residual. `searchCards()` compiles the
   AST and ANDs it with `buildFacetConditions()` of the **URL** facets
   only. Flattening `q` into `params.faction` and also compiling the AST
   would double-filter.
6. **URL facets still win** over the same field in `q` (existing
   `?faction=nbn&q=f:anarch` → NBN, token consumed). Banner still reads
   raw URL params via `describeFacets`. `q=format:standard` does **not**
   grow a "filtered by" note. Because URL `banned=` becomes a real simple
   filter, add `banned` to `FACET_PARAMS` (and the `/cards` hidden carried
   inputs) so `?format=standard&banned=1` is described like the other URL
   facets. Tokens inside `q` stay out of the banner.
7. **First-prefix-wins is revoked.** `f:anarch f:criminal` is AND (0 cards).
   Two factions is `f:anarch | f:criminal`. Call this out on `/cards/syntax`.
   It is the one intentional break with today's copy.
8. **`isPublic @default(true)`** is a safety net for the existing ~74k NRDB
   rows, not the user-facing default. Create/clone **always pass
   `isPublic: false`** unless the publish checkbox is on.
9. **No deck-wide legality gate on save.** Influence / agenda / count stay
   display-only on the detail page, as today. Enforcing 3-of / MWL /
   points-budget is still the Phase 8 deferral.

## Scope

Build order:

1. **Simple search syntax** (no schema). Independent of 2/3, except that
   `/decklists/[id]/edit`'s add-card search calls `searchCards()` and
   inherits the new language for free. Build this first or in parallel.
2. **User decklists** (schema + visibility + `/me` + CRUD). Rewrites
   `/decklists/[id]` chrome (404, owner byline, Favorite + Save a copy,
   Edit / Delete / publish-state).
3. **Decklist card hover.** Wrap names on the finished detail page so
   `cardRow()` is not rewritten twice. Hover adds no schema, no sync, no
   new dependency.

---

## 1. Simple search syntax

Simple search only: the `q` box on `/`, `/cards`, and the Simple search
field on `/cards/advanced` (all already submit to `/cards`). Plus rewrite
`/cards/syntax` so it documents what this section ships.

Out of scope for this section (do not touch): advanced Card Name / Card
Text prefix parsing (still literal); a visible Banned picker on
`/cards/advanced`; decklist / rules search syntax; quoted phrases, regex,
numeric comparisons (`o:`, `p:`, …), flavor (`a:`); NRDB illustrator
(`i:` in NRDB — this phase uses `i:` for **title**); schema, sync, or GIN
indexes; a new npm parser library.

### 1a. Operator table

Every operator has a short form and a long form, case-insensitive on the
prefix, documented as a pair. Type-ahead inserts the **code** (same as
today: `f:ana` → `f:anarch `), never the display name. Longest-prefix
match is mandatory (`title:` is not `t:` + `itle:`; `set:` is not `s:` +
`et:`). Sort prefixes by length descending before matching.

| Short | Long | Also accepted | Type-ahead | Value |
|---|---|---|---|---|
| `f` | `faction` | | yes | exact `factionCode` (unchanged: `haas_bioroid`, case-sensitive value) |
| `t` | `type` | | yes | exact `typeCode` |
| `s` | `subtype` | `keyword` | yes | exact `keywords[]` membership |
| `d` | `side` | | yes | `corp` / `runner` |
| `fmt` | `format` | | yes | `Format.id` or `Format.name`, case-insensitive (`format:standard`, `format:Standard`) |
| `ban` | `banned` | `b` | yes (`yes` / `no`) | `yes`/`y`/`1`/`true` → banned; `no`/`n`/`0`/`false` → not banned |
| `e` | `set` | `pack` | yes | see Set / cycle below |
| `cy` | `cycle` | `c` (NRDB's letter) | yes | see Set / cycle below |
| `i` | `title` | | **no** | phrase against `title` only |
| `x` | `text` | | **no** | phrase against `text` only |

`b` is an alias because `/cards/syntax` currently says "there is no `b:`"
and people will try it. It is **not** NRDB's ban-*list* id operand.

`i:` is **title**, not NRDB's illustrator. jinteki has no illustrator data
(`agent-reports/netrunnerdb-ux-research.md` §5). Say so on the syntax page.

Unrecognized prefixes stay residual text, same as today.

Keep the compact tokens working. `f:anarch virus` stays faction Anarch AND
residual `"virus"`. `f:anarch t:program` stays AND of two prefixes.
Optional whitespace after the colon is also accepted (`f: anarch`).

### 1b. Two value kinds

**Code-valued** (`f` `t` `s` `d` `fmt` `ban`): optional space after the
colon, then one `\S+` token. Following words are a new term. This is what
keeps `f:anarch virus` working.

**Phrase-valued** (`i` `x` `e` `cy`): optional space after the colon, then
everything until a terminator:

- whitespace-surrounded `AND` / `OR` / `&` / `|` (any case on the words)
- `(` or `)` (may sit flush against a term)
- another recognized `prefix:` at a word boundary
- end of string

So `i:sure gamble` is title `"sure gamble"`; `i:sure gamble & f:anarch` is
that title AND Anarch; `e:kala ghoda t:program` is that set AND type Program.

### 1c. Set / cycle matching

Resolve a set value to one or more `Pack.code`s, then reuse the existing
`card_set_ids` containment (OR if several packs). Match, case-insensitive:

1. exact `Pack.code`
2. exact `Pack.name` (so `e:kala ghoda` / `set:Kala Ghoda` both hit)
3. if the whole value is an integer, `Pack.position` — this is the
   **in-cycle index**, not a global catalog number; `e:1` ORs every pack
   whose position is 1. Document that. Type-ahead inserts the code, which
   is the intended path.

Resolve a cycle value to a `Cycle` row, collect `Pack.code` where
`cardCycleId` matches, same containment. Match, case-insensitive:

1. exact `Cycle.id` (`mumbad`)
2. exact `Cycle.name` (`Mumbad`)
3. integer → `Cycle.position` (`cy:10` = Mumbad)

Unknown value → the predicate matches nothing (same as `f:anar` today). Do
not mine `legacy_code` out of `raw` (`kg`, etc.). Do **not** read untyped
`Card.raw.attributes.card_cycle_ids`.

No new URL `cycle=` param. Cycle is a `q` prefix only.

### 1d. Format + banned

`format:standard` is current-pool membership, same SQL as `?format=standard`
(613 as of this writing; **re-count at build**).

`banned:yes` / `ban:no` use the same restriction JSONB as advanced
(`raw.attributes.restrictions.banned` vs `Format.activeRestrictionId`).
Requires a format from, in order: a format term in the same query, else
URL `format=`. Without a format: `banned:yes` matches nothing, `banned:no`
is a no-op — same as advanced's `banned=1` without `format`. Restricted /
points cards stay in on `banned:no`; they are still legal.

The supported happy path in the box is `format:standard banned:yes`. Nested
`banned` / `format` OR combinations (`banned:yes | format:standard`) are
not a target.

Lift the banned SQL out of `searchCardsAdvanced` into a helper both engines
call. `parseCardSearchParams` also reads URL `banned` so
`/cards?format=standard&banned=1` works, not only the prefix form. URL
`banned` stays `1`/`0` (advanced's `validBanned()`). Prefix values are the
yes/no set in the operator table.

### 1e. Grammar

No new dependency. New module e.g. `src/lib/search/query-syntax.ts`:
registry, tokenizer, recursive-descent parser, AST.

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

Text terms (`i:`, `x:`, residual) use simple search's existing always-on
`word_similarity` **OR** `ILIKE` (`plans/SEARCH_MATCHING.md`), restricted
to one column for `i:` / `x:`. Residual is still title **or** text.

Compile the AST to one `Prisma.sql` fragment (parameterized, never
`$queryRawUnsafe`).

Ranking: if the AST has any text terms, `GREATEST` of those
`word_similarity`s (title-only terms only score title, etc.). Facet-only
queries stay `title ASC` unless `order=` is set.

Space-separated terms are AND.

### 1f. Type-ahead

`src/components/simple-search-box.tsx` + `src/lib/search/prefix-options.ts`.

- `PREFIX_FIELD` / `PREFIX_TOKEN` gain every completable short **and**
  long form. **Do not** add `i` / `title` / `x` / `text`. The existing
  test that `findPrefixToken("x:foo")` is `null` stays green.
- `valueStart` is `start + prefix.length + 1`, not hardcoded `start + 2`.
  `faction:` must complete; a one-letter assumption would splice into the
  word `faction`.
- Optional `!` immediately before the prefix still opens the menu (`!f:`).
- If the caret is on a bare word and the previous token is a completable
  `prefix:` with a trailing space (`f: ana`), complete that field — so
  `f: anarch` is typeable, not only `f:anarch`.
- `getPrefixOptions()` adds: formats (`id` / `name`), packs (`code` /
  `name`), cycles (`id` / `name`), banned (`yes` / `no`). Completions
  still splice `option.value` plus a trailing space.
- No-JS fallback unchanged: plain `<input name="q">`.
- Cap still 8 suggestions; match label or value, case-insensitive.

### 1g. Syntax page

Rewrite `src/app/cards/syntax/page.tsx` so it documents **only what this
phase ships**. In particular:

- Prefix table becomes short + long (+ aliases) + example + type-ahead
  yes/no. Worked counts re-derived against the live DB at build, not copied
  from this file.
- New sections: boolean logic (space AND, `AND`/`OR`/`&`/`|`, parens, `!`),
  title/text operators, set/cycle, format/banned in the **simple box**.
- Delete "these are not simple-search prefixes — there is no `b:`".
  Advanced results URLs `format=` / `banned=` still work; they are no
  longer the only way. Keep a one-liner that the same filters exist as
  query params on `/cards/advanced/results`.
- Drop negation, OR, `x:` / `e:` from "Not supported". Keep quoting,
  regex, numeric operands, flavor, illustrator.
- State the `f:anarch f:criminal` meaning change.
- State `i:` ≠ NRDB illustrator.
- State `&`/`|` need spaces; `t:program|t:resource` does nothing special.

Home-page hint (`f:anarch virus`) stays; it remains valid.

`src/app/cards/page.tsx` comments that still describe `extractOperators`
folding and residual `params.q` need updating; the box `defaultValue`
already reads raw `q` and stays that way.

### 1h. Section tests

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
  today's `parseCardSearchParams({ q: "x:foo bar" })` test — after this
  section `params.q` is the raw string `"x:foo bar"` and the AST carries
  a text-only term `foo`, not a residual literal `x:foo bar`).

Real-DB tests in `cards.test.ts` (re-count, do not hard-code this plan's
numbers into asserts without querying):

- `q=format:standard` equals `?format=standard` (current pool).
- `q=format:standard banned:yes` equals advanced `format=standard&banned=1`
  and `getFormatCardStatus`'s banned codes.
- `q=format:standard banned:no` equals pool minus banned.
- `q=f:anarch t:program` and `q=f:anarch virus` totals unchanged from today.
- `q=faction:anarch` equals `q=f:anarch`.
- `q=!f:anarch` equals total − Anarch.
- `q=f:anarch | f:criminal` equals the union of each alone.
- `q=i:<a title-only word>` vs `q=x:<the same word>` vs residual `q` —
  pick a real word like `virus` (syntax page already pins title 3 / text 78 /
  simple wider).
- `q=e:kala_ghoda` (and `e:kala ghoda`) equals `?pack=kala_ghoda`.
- `q=cy:mumbad` (and `cy:10`) equals cards whose `card_set_ids` overlap
  Mumbad's packs.

`simple-search-box.test.ts`: long-form `faction:` valueStart; `format:` /
`e:` / `cy:` / `ban:` open; `x:` / `i:` / `title:` still `null`.

Advanced banned tests keep passing against the shared helper.

---

## 2. User decklists

A signed-in user can collect decklists on their profile — ones they like
while browsing, and ones they make — and those they own stay private
unless they opt in to publish.

What already exists and must not be rebuilt: `DecklistFavorite` +
`toggleDecklistFavorite` on `/decklists/[id]`; `/favorites` listing those
bookmarks (this phase redirects it); the same `Decklist` / `DecklistCard`
row shape NRDB sync writes, rendered by `/decklists/[id]`.

NRDB-synced lists are already public (that's the dataset `/decklists` is).
Privacy applies to **user-owned** rows, not to hiding NRDB data.

### 2a. Two collections, not one

| Collection | What it is | Visibility |
|---|---|---|
| **Favorited** | Pointer at an existing public `Decklist` (NRDB or a published user list). Unchanged Phase 5 toggle. | The list itself stays public. The fact *you* favorited it stays on your profile. `/decklists?tab=favorited` still counts public favorites only. |
| **Owned** | A `Decklist` row with `ownerId = you`. Created blank, or cloned from a list you were browsing. | **Private by default.** Public only if you tick publish. Private rows never appear in `/decklists` or `/decklists/advanced`, and `/decklists/[id]` 404s for anyone who is not the owner (including signed-out). |

"Save while browsing" is two buttons on `/decklists/[id]`, not a new
concept: **Favorite** (already there) and **Save a copy to my decks**
(new — clones into an owned private row and redirects to it). Unsigned
clicks of either redirect to sign-in, same as `toggleDecklistFavorite`
today.

Do not fold Favorite and Save-a-copy into one button. Do not let a user
unpublish an NRDB list (they do not own it). Favorite of a private list
is refused — favorites are pointers at public lists.

### 2b. Schema

Same `Decklist` table. A second table would duplicate `DecklistCard`, the
detail page, and search. NRDB ids are UUIDs
(`91383315-750e-49e5-91a6-6e280bf02fc0` in
`src/sync/__fixtures__/decklist.json`); user ids use `@default(cuid())`,
which does not collide with that namespace. Sync upserts by the NRDB id
it fetched, so it cannot clobber a cuid row.

Add to `Decklist`:

- `ownerId String?` — FK to `User.id`, `onDelete: Cascade`. Null means
  NRDB-synced.
- `isPublic Boolean @default(true)` — existing ~74k rows stay public
  without a data backfill. User-create/clone always pass `false` unless
  the publish checkbox is on.
- `notes String?` — user-authored plain text. NRDB notes stay in `raw`
  and keep going through `plainTextFromNotes`. The detail page prefers
  `notes` when set, else the existing raw path.
- `id` gains `@default(cuid())` so creates need not invent an id. Sync
  still passes the NRDB UUID explicitly.

`createdAt` / `updatedAt` already exist and are nullable. Owned creates
set both to now; edits bump `updatedAt`. `raw` stays required; owned rows
store `{}`.

`User` gains the reverse `ownedDecklists Decklist[]`. Index `ownerId`.

Migration must not drop the five `pg_trgm` GIN indexes (standing schema
hazard in `schema.prisma`'s header). Inspect generated SQL for GIN-index
drops before applying. After migrate, regenerate `docs/schema.md` via
`pnpm docs:schema`.

### 2c. Visibility — one helper, every public query

A small helper (e.g. `src/lib/decklist-visibility.ts`):

- `publicDecklistSql()` → `d."isPublic" = true` (covers NRDB rows and
  opted-in owned rows; private owned rows are `false`).
- `canViewDecklist(decklist, userId)` → `isPublic || ownerId === userId`.

Wire `publicDecklistSql()` into **every** listing that is not the owner's
own profile:

- `searchDecklistsByTab` in `src/lib/search/decklists.ts` (all four tabs,
  including the favorited join — a private deck must not rank there).
- `searchDecklistsAdvanced` in `src/lib/search/decklists-advanced.ts`
  (push onto `conditions` so it is present even when no other facet is
  set; today's no-filter query is `WHERE`-less and would otherwise leak).

`/decklists/[id]`: 404 when `!canViewDecklist`. Do not 403 — existence of
a private id is not public information. Skip the NRDB "View on
NetrunnerDB" link and `nrdbUserId` byline on owned rows; show the jinteki
owner's `User.name` instead. Owner sees Edit / Delete / publish-state.

Sync (`src/sync/sync-decklists.ts`) is unchanged in behavior (it only
upserts the UUID it fetched). Add a comment that any future wipe-all
**must** exclude `ownerId IS NOT NULL`. Do not add a wipe.

`toggleDecklistFavorite` / `toggleCardFavorite` should `revalidatePath("/me")`
as well as `/favorites`, since `/favorites` now redirects.

### 2d. Profile — `/me`

Signed-in only (redirect to `/api/auth/signin`, same as `/favorites`).

Two decklist sections plus the existing favorited-cards list:

1. **My decklists** — `Decklist` where `ownerId = session.user.id`, newest
   `updatedAt` first. Each row: name, identity, Private/Public badge,
   links to view and edit. Empty state names the New button. A **New
   decklist** link.
2. **Favorited decklists** — existing `DecklistFavorite` query, restricted
   to lists the user can still view (a list that was favorited then
   unpublished by its owner must not 404-link from here).
3. **Favorited cards** — existing `CardFavorite` query.

No `/users/[id]` public profile. Publishing means "this row is eligible
for `/decklists` browse/search", not "other people get a page of
everything I've made."

### 2e. Create, clone, edit

Plain Server Actions bound to HTML forms, same progressive-enhancement
style as `favorites.ts`. Gated with `requireSession()`; unauthenticated →
sign-in redirect (the same try/catch → `redirect("/api/auth/signin")`
pattern `favorites.ts` already uses — `requireSession()` itself throws).
`revalidatePath` the owned id, `/me`, and `/decklists` (so a publish
lands on Recent).

| Action | Behavior |
|---|---|
| `createDecklist` | Name + required identity. `ownerId = me`, `isPublic = false`, empty `raw`, `createdAt`/`updatedAt` now. Also writes the identity as a `DecklistCard` qty 1 (NRDB's own `card_slots` include the identity; `/decklists/[id]` already filters it out of the displayed list). Redirect to `/decklists/{id}/edit`. |
| `cloneDecklist` | From a viewable source id. New cuid row, `ownerId = me`, `isPublic = false`, name `Copy of {source.name}`, same identity/slots. Notes: copy `source.notes` if set, else `plainTextFromNotes` of the source raw notes into the new `notes` column. Owned `raw` is `{}` — do not copy NRDB `raw`. Redirect to the copy's detail page. Refuse if the source is not viewable by this user. |
| `updateDecklist` | Owner only. Name, notes, identity, `isPublic`, and the slot list (cardCode + quantity). Replace-all-slots in one transaction, same pattern as `syncOneDecklist`. |
| `addDecklistCard` / `removeDecklistCard` | Owner only. Add is upsert-by-`(decklistId, cardCode)` (bump or insert). Quantity must be an integer ≥ 1. Unknown `cardCode` is rejected against `Card.code`, not stored as a dangling FK wait. |
| `deleteDecklist` | Owner only. `prisma.decklist.delete` (cards and favorites cascade). Redirect to `/me`. Refuse to delete `ownerId IS NULL` rows. |

Routes:

| Route | Job |
|---|---|
| `/decklists/new` | Signed-in form: name, identity `<select>` (every `corp_identity` / `runner_identity` card, title + faction). POST `createDecklist`. Static `new` segment, sibling of `[id]`, so it is not captured as an id. |
| `/decklists/[id]/edit` | Owner only; anyone else 404. Name, notes `<textarea>`, identity select, publish checkbox, current slots (qty input + Remove per row), and an **add-card** search: GET `q` on this same page, `searchCards({ q, pageSize: 20 })`, each hit an Add form (hidden `cardCode`, qty default 1). Save metadata is one form; slot add/remove are separate POSTs that re-render. No client-side deckbuilder. |
| `/decklists/[id]` | View, plus Favorite and (if signed in) Save a copy. Owner also gets Edit / Delete / a Private badge. |

Do **not** block save on influence, agenda points, minimum deck size, or
3-of. `/decklists/[id]` already *displays* influence / agenda / count;
keep that as information.

### 2f. Section tests

Real DB, no mocks, matching `decklists.test.ts` / favorites conventions.

- Visibility helper: public → anyone; private + matching owner → yes;
  private + other/null user → no.
- `searchDecklistsByTab` / `searchDecklistsAdvanced` with one private
  owned row inserted: public totals equal the pre-insert count; the
  private id is absent from items. Flip `isPublic` true → it appears
  (Recent, and an unfiltered advanced query).
- Clone: new row, different id, `ownerId` set, `isPublic = false`, slot
  set equal to source (query `DecklistCard` both sides).
- Update/delete refuse when `ownerId` is some other user or null.
- Identity create writes a `DecklistCard` qty 1 for the identity code,
  and that code's `typeCode` is `corp_identity` or `runner_identity`.
- Existing `decklists.test.ts` / `decklists-advanced.test.ts` stay green
  — they count today's NRDB rows, which remain `isPublic = true`.

---

## 3. Decklist card hover image

On `/decklists/[id]` only. Hovering a card name (identity line and every
slot row) shows that card's image next to the cursor/row. Left-click
still goes to `/cards/[code]`. Right-click still opens `CardReference`.
Touch/no-JS is unchanged: the name is still just a link.

No new data, no schema, no sync, no new dependency. The URL is computed
on the server from `card.raw` already in the query and passed as a prop.
Do not call `getCardReferenceData` or otherwise fetch on hover.

### 3a. Why a client component, not CSS `:hover`

A CSS-only `group-hover` `<img>` per row would put ~45–50 `<img>`s in the
DOM on load (a typical Netrunner deck) and cannot keep the preview inside
the viewport at the bottom of a long list. `CardReference` already
requires JS for the interesting interaction on these same names; a no-JS
user already sees plain links. Mount the `<img>` on first mouse hover of
that name so the CDN request happens on demand, not for every slot on
every page view.

New client component: `src/components/card-hover-image.tsx`, used only
from this page. Nest, do not fuse, with `CardReference` (Decision 4).
`src={null}` (the defensive miss in `getCardImageUrl`) renders children
only — no empty frame.

### 3b. Interaction

- **Mouse only.** `pointerenter` / `pointerleave` with
  `pointerType === "mouse"`. A tap on a phone must still just follow the
  link; do not leave a stuck overlay.
- **Show** on pointer enter of the wrapping span; **hide** on pointer
  leave. The image is a preview, not a second hit target — moving onto
  the image itself may hide it, and that is fine.
- **Position** `fixed`, derived from the name's `getBoundingClientRect()`.
  Prefer the right of the name (the page is `max-w-3xl` centred, so
  desktop usually has empty margin there); flip to the left if it would
  overflow; clamp vertically so the bottom of a long list does not clip.
  Extract that math as a pure function and unit-test it — it is the only
  new logic that is not "setState on mouse".
- **`z-40`**, under `CardReference`'s existing `z-50`, so a right-click
  popover stacks on top of the preview without the two components talking
  to each other.
- **Display size 300px wide**, same as `/cards/[code]` and the card-search
  grid. Use `getCardImageUrl(..., "large")` so the bitmap is native at
  that width (do not upscale `small`/`tiny`). Height follows the card
  aspect (~419).
- **Plain `<img>`**, not `next/image`, same `eslint-disable-next-line
  @next/next/no-img-element` plus the existing "hotlink, no local caching"
  comment used on the detail page and in `card-results.tsx`.

Do not change the list layout. It stays a text list in `max-w-3xl`; the
image is an overlay, not a second column and not a new `view=` mode.

### 3c. Section tests

Pure unit tests for the positioning helper: room on the right → place to
the right; no room on the right → flip left; near the bottom of the
viewport → clamp so the image stays on screen; near the top → do not go
negative.

No new query-layer tests. `getCardImageUrl` is unchanged. The Prisma
include on this page is unchanged.

---

## Explicitly out of scope

Union of the three source docs, plus anything this phase is not:

- Advanced Card Name / Card Text prefix parsing.
- A visible Banned (or Restricted / Points) picker on `/cards/advanced`.
- Decklist / rules search syntax.
- Quoted phrases, regex, numeric operands (`o:`, `p:`, …), flavor (`a:`),
  illustrator (jinteki has no illustrator data; `i:` is title).
- A new npm parser library.
- A visual/live deckbuilder (search-as-you-type tray, drag-drop, running
  influence/agenda/legality as a save gate, card-draw simulator, export
  formats). The edit page is a form.
- Row-level favorite/clone buttons on `/decklists` list rows (still the
  Phase 5 deferral). Detail page is enough.
- Public `/users/[id]` profiles, comments, likes-as-popularity, fork lineage.
- Publishing to NRDB, or treating jinteki `User` as `Decklist.nrdbUserId`.
- Making favorited-NRDB-lists themselves private.
- Changing how favorites work, or folding Favorite and Save-a-copy into
  one button.
- Deck-wide MWL/points-budget legality (`PHASE_8_PLAN.md`).
- Hover previews on `/cards`, `/cards/advanced/results`, `/me`,
  `/favorites`, the edit page, or anywhere else a card name is already
  wrapped in `CardReference`.
- Folding hover into `CardReference` as an optional `imageUrl` prop.
- A CSS-only `:hover` implementation, a tooltip/popover library, or
  `next/image`. Prefetching every slot's image on page load. An inline
  image column, a grid/`view=` mode for the decklist, or a persistent
  preview pane. Click-to-pin, keyboard focus preview, or making the
  overlay itself a link.
- Any change to `getCardImageUrl`, the decklist query's includes,
  sort/grouping, or `CardReference`'s right-click behaviour.
- Renaming the `Pack` Prisma model or the `pack=` query param.
- Deployment / hosting.

---

## Testing (repo-wide)

Same Vitest conventions as every prior phase: no mocking, real Postgres
for DB-backed tests, pure-function tests for the parser, visibility
helper, and hover positioning.

Section 1 / 2 / 3 test lists above are the minimum new cases. Existing
`cards.test.ts`, `cards-advanced.test.ts`, `decklists.test.ts`,
`decklists-advanced.test.ts`, and `simple-search-box.test.ts` stay green
except where this plan **explicitly** changes behaviour (first-wins
revoked; `x:foo` is a text operator; `parseCardSearchParams` no longer
folds prefixes into `faction` / residual `q`).

---

## Verification

Full `PROJECT_PLAN.md` "Phase verification standards": typecheck
(`tsc --noEmit`) and lint clean, `pnpm test`, `pnpm dev` + curl, a
**separate** `next build` + `next start` + curl (this phase adds
auth-gated routes and rewrites `/cards` query compilation). Both boots,
not one.

Because section 2 adds a migration:

- Direct `psql` introspection of `Decklist` (`ownerId`, `isPublic`,
  `notes`, default on `id`), not Prisma's success message.
- **GIN indexes still present** after the migration (`pg_indexes`
  contains `Decklist_name_trgm_idx` and the other four `trgm_idx`
  names).
- **Public listing count unchanged** by the migration itself:
  `SELECT count(*) FROM "Decklist" WHERE "isPublic"` equals
  `SELECT count(*) FROM "Decklist"` immediately after migrate (every
  existing row defaulted true). Re-check the live `/decklists` total
  against that number.
- `pnpm docs:schema` regenerated and the new columns show up in
  `docs/schema.md`.

No `$queryRawUnsafe` / string-concat SQL in new files.

### Section 1 curls

Expected counts re-derived via `psql` the same day, not copied from this
file.

- `/cards?q=format:standard` — same total as `/cards?format=standard` and
  as `/cards/advanced/results?format=standard`.
- `/cards?q=format:standard%20banned:yes` — same banned codes as advanced
  `banned=1`.
- `/cards?q=f:anarch+virus` — still the current Anarch+virus-text total;
  box `value` is the raw `q`; no "filtered by" banner.
- `/cards?q=f:anarch+%7C+f:criminal` — union, not first-wins Anarch.
- `/cards?q=e:kala+ghoda` and `/cards?q=cy:mumbad` — non-zero, equal to
  the direct pack/cycle SQL (19 / 114 as of this writing).
- `/cards/syntax` — grep that `format:standard` appears as a **prefix**
  example, that the "there is no `b:`" sentence is gone, and that `!` /
  `OR` / `title:` / `set:` are documented.

Type-ahead dropdowns need a real browser; curl cannot prove them. Unit
tests cover token detection / splice; say that gap in the task report.

### Section 2 curls

- **Unauthenticated `GET /me`, `GET /decklists/new`,
  `GET /decklists/{ownedId}/edit`** → redirect to sign-in.
- **Unauthenticated `GET /decklists/{privateId}` → 404** (create a
  private row with `psql`/`prisma` for the check, then curl with no
  cookie). Same id with the owner's session cookie → 200 and the name.
  A non-owner session → 404.
- **Unsigned POST** of clone/create/update → redirect to sign-in, no new
  row (`SELECT count(*) FROM "Decklist" WHERE "ownerId" IS NOT NULL`
  unchanged).
- **Create via the real form POST** with a session cookie: one new row,
  `ownerId` = that user, `isPublic = false`, identity slot present, and
  that identity's `typeCode` is `corp_identity` or `runner_identity`.
  Then `GET /decklists` HTML does not contain that name; `GET /me` does.
- **Publish**: POST update with the checkbox on, then the name appears
  in `GET /decklists` (Recent). Uncheck, it disappears again.
- **Clone** of a known public NRDB id (use a real synced UUID): second
  row, cuid id, same `identityCode`, same `DecklistCard` cardinality as
  the source.
- **Sync does not eat owned rows**: after an owned create,
  `pnpm sync:decklists` (incremental is enough) leaves that row in place.
- **`GET /favorites`** redirects to `/me`. Header Favorites link and
  username both land on `/me`.

Form POSTs are curl-able; hover/layout of the edit page still needs a
human look. Say so in the task report.

### Section 3 curls

- **Dev `curl` of a real `/decklists/{id}`.** The rendered HTML/RSC
  payload contains `card-images.netrunnerdb.com` (the `src` prop must be
  in the tree, not fetched later) and still contains `CardReference`
  usage for those same names. Grep, don't paste the page. Pick a real
  synced id; the identity title and at least one slot title must both
  sit inside a hover wrapper.
- **Production `build` + `start` + the same curl.**
- **A known-good image URL from that payload actually returns 200** from
  NRDB's CDN (`curl -I`), same check Phase 4 used for `sure_gamble`.
  Proof the prop is a real hotlink, not just a well-formed string.

The hover itself (mouse enter/leave, flip-to-left, stacking under the
right-click popover, touch-does-not-stick) needs a real browser, which
this environment does not have. Say so in the task report; do not claim
the interaction "works" from curl. Same caveat `CardReference` has
carried since Phase 5.

(The topical hover plan's "no schema/sync/search files in the diff"
check does **not** apply to this combined phase — sections 1 and 2
legitimately touch search and schema. Hover itself still must not add
schema, sync, or search files.)

Once verification passes, `agent-reports/phase-12.md` is the task report
per `AGENTS.md`. Then move the three topical source docs to
`plans/archive/`.

---

## Follow-up: decklist edit/view UI (post-ship)

Shipped Phase 12 left the edit page as a separate, poorer list: no
`CardReference`, no hover, quantity at the end in small type, identity
as a `text-sm` line with no on-page thumbnail, Save always black, and
**New decklist** only on `/me`. This follow-up is view/edit presentation
only. No schema, no search syntax, no legality gate.

Do **not** revive `plans/archive/USER_DECKLISTS_PLAN.md` as a build spec;
this section is the spec.

### 1. New decklist from `/decklists`

`src/app/decklists/page.tsx`: add a **New decklist** link next to Search
in the heading row, pointing at `/decklists/new`. Unsigned clicks still
hit that route, which already redirects to sign-in. Do not add a second
create form on the listing page.

### 2. Save button: dirty + click feedback

The edit page's **Save** (`updateDecklist`) is the only write for a JS
session. Add, remove, qty, name, notes, identity, and publish all stage
in working state until Save. Add/remove server actions remain only as a
no-JS fallback (forms still POST if JS never hydrates).

- **Disabled / grey** when the working state matches the last-saved
  snapshot (name, notes, identity, publish checkbox, the slot list).
  Use muted styles (`bg-zinc-300` / similar, `text-zinc-500`,
  `disabled:opacity-…`), not the current `bg-foreground`.
- **Enabled / black** (`bg-foreground text-background`) when dirty, and
  on `/decklists/new`'s **Create** once name + identity are filled
  (native `required` is enough there; Create is not a dirty-tracker).
- **Click feedback:** while the Server Action is pending, label
  **Saving…** and keep the button disabled. On success, after the
  re-render, show a short **Saved** note next to the button (query param
  `saved=1` that the page reads, or equivalent). Clear dirty so Save
  greys again.
- No-JS: Save stays enabled (cannot detect dirty without JS). Dirty
  tracking is a client wrapper around the existing form, not a new
  fetch API.

Brand-new lists land on edit after Create already persisted name +
identity. That first edit view starts **clean** (grey Save) until the
user changes something. Create itself is the "first creating" black
button.

### 3. Edit uses the view list, plus add / qty / remove

The general principle: **editing the deck retains the same view as
regular, and only adds add / change-qty / remove.**

Extract the sectioned card list (sort links, type/faction/set/name
groupings, hover + `CardReference` + title link, set name, faction-type-
side, influence pips) into a shared module used by both
`/decklists/[id]` and `/decklists/[id]/edit`. Edit does **not** keep a
second plain-text slot list or a separate "Remove cards" list.

On edit, each row additionally has:

- quantity as an editable number input (see §5 for placement)
- a **Remove** control that drops the row from working state (Save
  persists the omission). No immediate `removeDecklistCard` POST when JS
  is on.
- hidden `cardCode` fields so Save still replace-all-slots

The add-card search stays below the list (GET `q`). **Add** appends or
bumps that card in working state and turns Save black; it does not write
the database until Save. Add-card hits should also be title links (and
hover if `raw` is in the search summary — `CardSummary` already has
`raw`).

Sort links on edit preserve `q` if present.

### 4. Identity: larger type + visible thumbnail

On **view and edit** (shared header):

- Identity title is **slightly larger** than a regular slot title
  (`text-lg` vs the slot title's default/`text-base`). Faction in
  parentheses can stay smaller.
- A **visible thumbnail** of the identity card sits in the header, not
  only on hover. Use `getCardImageUrl(..., "medium")` (or `"small"` if
  medium is too wide), displayed ~120px wide, plain `<img>` with the
  existing hotlink / `no-img-element` comment. Hover-large on the name
  stays. `src={null}` → skip the thumb, still show the name.

Edit may keep the identity `<select>` near this header (changing
identity is an edit function); the displayed thumb/title follow the
currently saved identity until Save.

### 5. Quantity before the name, same size as the name

View row, left cluster, same font size as the title (not `text-sm`):

`{qty} {title-link}` then the existing small metadata on the right
(set, faction-type-side, pips). Drop the trailing `x{qty}`.

Example: `3 DreamNet` then `Uprising Neutral Runner - Resource - Runner`
and pips — not `DreamNet … x3`.

Edit: the qty **input** occupies that same leading slot (same size as
the title), then the linked hoverable name, then metadata, then Remove.

### Testing / verification (this follow-up)

- `tsc --noEmit`, lint, `pnpm test` green. Pure tests for any dirty
  snapshot helper (dirty vs clean; qty change; no-op same values).
- Dev curl + production `build`/`start` curl of a real public
  `/decklists/{id}`: identity thumb URL in the tree (`card-images` +
  identity title `text-lg` or equivalent class); first slot qty appears
  **before** the title and there is no trailing `xN` on that row.
- Curl `/decklists` contains `New decklist` / `/decklists/new`.
- Curl an owned `/decklists/{id}/edit`: same hover/CardReference wrap as
  view; qty input present; no separate "Remove cards" heading; Save
  button markup present.
- Dirty/pending/Saved interaction needs a browser; say that gap. No-JS
  Save remaining enabled is intentional.

Out of scope still: visual deckbuilder, hover on `/cards`, legality as a
save gate.
