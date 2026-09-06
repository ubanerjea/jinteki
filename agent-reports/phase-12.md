# Phase 12 — Task Report: Simple Search Syntax, User Decklists, and Decklist Card Hover

Built against `plans/PHASE_12_PLAN.md`. Chain: build subagent → orchestrator static
review → independent verify subagent. Nothing marked "Explicitly out of scope" was
built (no visual deckbuilder, no hover outside `/decklists/[id]`, no visible Banned
picker, no quoting/regex/numeric/flavor, no `/users/[id]`, no Pack model/`pack=`
rename).

This is the **consolidated** report (build + review + verify). Verify independently
re-derived the plan's checks rather than trusting the build's self-reported numbers.
Supporting notes: `agent-reports/phase-12-build.md`, `agent-reports/phase-12-verify.md`.

## What was built

### 1. Simple search syntax

- **`src/lib/search/query-syntax.ts`** — operator registry (longest-prefix),
  tokenizer, recursive-descent parser, AST. No npm parser library. Empty `and` /
  `or` as the whole query is residual text. Unmatched parens and dangling `&` /
  `|` compile to match-none.
- **`src/lib/search/cards.ts`** — `extractOperators()` removed.
  `parseCardSearchParams()` keeps raw trimmed `q` and reads URL `banned` (`1` /
  `0`). `searchCards()` compiles the AST and ANDs it with
  `buildFacetConditions()` of URL facets only. URL facets win over the same
  field in `q`. Ranking uses `GREATEST` of AST text-term `word_similarity`s;
  facet-only queries stay `title ASC` unless `order=` is set. Shared
  `validBanned()` / `bannedCondition()` lifted for both engines.
- **`src/lib/search/cards-advanced.ts`** — uses the shared banned helper.
  Advanced Card Name / Card Text still do not parse prefixes.
- **`src/lib/search/prefix-options.ts`** — formats, packs, cycles, banned
  yes/no added.
- **`src/components/simple-search-box.tsx`** — completable short and long
  forms; `valueStart = start + prefix.length + 1`; optional `!`; trailing-space
  `f: ana` still completes. `i:` / `title:` / `x:` / `text:` stay null.
- **`src/lib/search/filter-summary.ts`** — `banned` added to `FACET_PARAMS`.
- **`src/app/cards/syntax/page.tsx`** — rewritten for what this phase ships.
  "there is no `b:`" deleted. First-wins revoked; `i:` ≠ illustrator; `&`/`|`
  need spaces.
- Home-page hint `f:anarch virus` unchanged.

### 2. User decklists

- **`prisma/schema.prisma`** — `Decklist.ownerId` (FK User, Cascade),
  `isPublic @default(true)`, `notes`, `id @default(cuid())`,
  `User.ownedDecklists`, index on `ownerId`.
- Migration **`20260906161416_add_decklist_owner`** — ADD COLUMN / index / FK
  only. No GIN-index DROPs.
- **`src/lib/decklist-visibility.ts`** — `publicDecklistSql()`,
  `canViewDecklist()`. Wired into all four `searchDecklistsByTab` tabs
  (including favorited) and `searchDecklistsAdvanced` (always on
  `conditions`, so an unfiltered advanced query is no longer WHERE-less).
- **`src/lib/identity-cards.ts`** — select is
  `typeCode IN ('corp_identity', 'runner_identity')` (148), not `'identity'`.
- **`src/lib/owned-decklists.ts`** + **`src/app/actions/decklists.ts`** —
  create / clone / update / add / remove / delete. Create/clone always
  `isPublic: false`. Clone notes: `source.notes` if set, else
  `plainTextFromNotes` of source raw. Owned `raw` is `{}`.
- Routes: `/me`, `/favorites` → `/me`, `/decklists/new`,
  `/decklists/[id]/edit`. Header username and Favorites nav both go to `/me`
  (label stays Favorites).
- **`/decklists/[id]`** — 404 when `!canViewDecklist`; owned rows skip NRDB
  byline/link and show `User.name`; owner gets Edit / Delete / Private-Public;
  Favorite + Save a copy. Notes prefer the `notes` column over raw.
- **`src/app/actions/favorites.ts`** — also `revalidatePath("/me")`;
  favoriting a private list is refused.
- **`src/sync/sync-decklists.ts`** — comment that any future wipe-all must
  exclude `ownerId IS NOT NULL`. No wipe added.

### 3. Decklist card hover

- **`src/components/card-hover-image.tsx`** — mouse-only
  (`pointerType === "mouse"`), mount `<img>` on first hover, `z-40`, 300px,
  `getCardImageUrl(..., "large")`, plain `<img>` with the existing
  eslint-disable + hotlink comment. `src={null}` → children only.
  `computeHoverPosition` extracted and unit-tested.
- Used only from `/decklists/[id]`, wrapping identity and every slot:
  `CardHoverImage` > `CardReference` > `Link`. List layout unchanged.

## Deviations from the plan

1. **`id` default is Prisma-client `cuid()`, not a Postgres DEFAULT.** `\d
   "Decklist"` shows `id` with no `column_default`. Creates via Prisma Client
   omit the id (verified). Sync still passes the NRDB UUID.
2. **Mutation logic lives in `src/lib/owned-decklists.ts`**, with Server
   Actions as session/redirect/revalidate wrappers. Tests cannot call
   `redirect` / `requireSession` without mocks, which this repo forbids.
3. **Existing decklist search tests now compare against `isPublic: true`
   counts.** Totals were unchanged at migrate time because every NRDB row
   defaulted public.
4. **Build subagent wrongly archived** `SEARCH_MATCHING.md`,
   `SIMPLE_CARD_SEARCH_PLAN.md`, and `ADVANCED_CARD_SEARCH_PLAN.md`.
   Orchestrator restored them during static review. Those files were not
   Phase 12 source docs (the plan archives the three topical sources after
   ship, not the older search plans).

No other intentional scope cuts.

## Static review (orchestrator)

Read query-syntax tokenizer/parser, `searchCards` AST compile (URL facets
only; banned helper shared), type-ahead `valueStart`, schema/migration,
visibility wiring (all four tabs + always-on advanced WHERE), owned
create/clone/update/delete, `/me` / `/decklists/new` / edit / detail chrome,
hover wrap + positioning helper, syntax page copy, header `/me` links.

No correctness issues found that blocked verify. Migration is add-only.
Identity select uses the two real typeCodes. First-prefix-wins is AND.
`publicDecklistSql()` is present even on unfiltered advanced search.

Nit noted, not a blocker: compiling `OR` when one side is a URL-consumed
prefix (`null`) drops the whole OR (TRUE | X = TRUE). Happy path
`?faction=nbn&q=f:anarch` is AND-of-consumed and is correct.

## Verification

Independent verify pass, 2026-09-06. Production `pnpm build` + `pnpm start` +
curl; HTML counted after stripping `self.__next_f.push` scripts **and** React
text-node `<!-- -->` comments (`613<!-- --> cards found`). Counts re-derived
via `psql` from plan semantics / `SEARCH_MATCHING.md`, not by copying
`cards.ts`.

Session cookie: real `Session.sessionToken` for user
`cms4y4wf60000qg1spcaonb6q`. That user was not signed out.

### Static

| Command | Result |
|---|---|
| `pnpm exec tsc --noEmit` | pass |
| `pnpm lint` | pass |
| `pnpm test` | **398 passed**, 0 failed, 30 files |
| `$queryRawUnsafe` / `$executeRawUnsafe` | comments only, zero actual usage |

### Schema / GIN

| Check | Result |
|---|---|
| `Decklist.ownerId` / `isPublic` / `notes` | present; `isPublic` default **true** |
| `id` SQL DEFAULT | none (cuid is Prisma-client) |
| GIN indexes | all 5 still present by exact name |
| Public = total immediately after migrate | **74242 = 74242** |
| `docs/schema.md` | documents the new columns |
| DISTINCT `typeCode` | no `identity`; 148 `corp_identity` + `runner_identity` |

`Format.standard.activeCardPoolId = standard_2026_vantage_point`  
`Format.standard.activeRestrictionId = standard_ban_list_26_03`

### Search counts (psql = dev curl = production curl)

| Predicate | psql | Rendered |
|---|---|---|
| `q=format:standard` = `?format=standard` = advanced `format=standard` | **613** | **613** |
| `q=format:standard banned:yes` = advanced `banned=1` | **29** | **29** |
| `q=format:standard banned:no` | **584** | **584** |
| `q=f:anarch virus` (anarch AND virus title-or-text `<%`/`ILIKE`) | **47** | **47**; box value is raw `q`; no Filtered-by banner |
| `q=f:anarch \| f:criminal` | **514** | **514** (union, not first-wins 253) |
| `q=f:anarch f:criminal` | **0** | **0** (AND) |
| `q=e:kala ghoda` = `?pack=kala_ghoda` | **19** | **19** |
| `q=cy:mumbad` = `q=cy:10` | **114** | **114** |
| `q=faction:anarch` = `q=f:anarch` | **253** | **253** |
| `q=!f:anarch` | **1801** | **1801** |
| `q=i:virus` / `q=x:virus` | 3 / 78 | 3 / 78 (not wider than ILIKE) |
| `?faction=nbn&q=f:anarch` | **241** | **241**; banner `Filtered by Faction: NBN` |
| `?format=standard&banned=1` | **29** | **29**; banner includes `Banned: 1` |

Banned **set equality** (production HTML `pageSize=100` vs independent SQL):
exactly the same 29 codes (bellona … world_tree).

`/cards/syntax` — `format:standard` is a prefix example; “there is no `b:`”
is gone; `!` / `OR` / `title:` / `set:` documented; first-wins meaning change
documented.

### User decklists (real HTTP + psql)

- Unauthenticated `GET /me`, `/decklists/new`, `/decklists/{id}/edit` →
  **307** `/api/auth/signin`. `GET /favorites` → **307** `/me`.
- Unsigned POST create/clone/update → **303** sign-in; owned count unchanged.
- Private id, no cookie → **404** (not 403). Same id with owner cookie →
  **200** and the name. NRDB id `/edit` with this user → **404**.
- Real form create: cuid id, `ownerId` = session user, `isPublic=false`,
  identity slot qty 1, `typeCode=runner_identity`. Name absent from
  `GET /decklists`, present on `GET /me`.
- Publish checkbox on → name is first Recent row and listing total +1;
  checkbox off → disappears again.
- Clone of `61e4dd61-dd12-4870-8668-2fbbc391eb7d`: cuid id, `Copy of …`,
  same `identityCode`, **25/25** `DecklistCard` rows, 0 mismatches.
- `pnpm sync:decklists` SUCCESS 618 records; all three owned probe rows
  still present afterward. (Incremental sync also grew public NRDB rows
  74242 → **74860**; that is NRDB ingest, not a visibility leak. HTTP
  public total matched `count(*) WHERE "isPublic"`.)
- Header with cookie: `href="/me">Favorites` and username `Unmeel Banerjea`
  both link to `/me`.
- Production cookie still authenticates `/me` (no AUTH_TRUST_HOST failure).

Probe rows were deleted. Owned count back to 0. Public 74860.

### Hover

Public decklist `61e4dd61-dd12-4870-8668-2fbbc391eb7d`: payload contains
**25** `card-images.netrunnerdb.com` URLs (identity + displayed slots).
Identity `MuslihaT: Multifarious Marketeer` and slot `Sure Gamble` sit in
the hover wrapper with `CardReference` still present.
`curl -I https://card-images.netrunnerdb.com/v2/large/35013.jpg` → **200**
`image/jpeg`. Same under production `next start`.

### Out of scope still absent

No visible Banned picker on `/cards/advanced`. No hover on `/cards`. No
`/users/[id]` (404). Edit page is a form (no canvas/drag). Prisma model
still `Pack`; param still `pack=`. `CardHoverImage` imported only from
`/decklists/[id]`.

## Unresolved / nits (not blockers)

- Type-ahead dropdown UX and hover mouse/touch/flip/stacking need a real
  browser. Unit tests cover token detection / splice / `computeHoverPosition`
  only. Same caveat `CardReference` has carried since Phase 5.
- Non-owner **second user** 404 was not proven (only one `User` row). Proven
  instead: unsigned 404, owner 200, and 404 when this user hits `/edit` on an
  NRDB row they do not own.
- Unsigned bound-action POSTs need `Origin: http://localhost:3000` under
  Next 16; a first curl without Origin produced `500 Failed to find Server
  Action`. The real form path with Origin is 303 to sign-in. Not a product
  bug.
- Edit-page layout still needs a human look.

**Fix-up round: not required.** Phase 12 is complete.

After this report, the three topical source docs
(`SIMPLE_SEARCH_SYNTAX_PLAN.md`, `USER_DECKLISTS_PLAN.md`,
`DECKLIST_CARD_HOVER_PLAN.md`) move to `plans/archive/`.

## Follow-up (2026-09-06): decklist edit/view UI

Post-ship presentation changes, spec in `plans/PHASE_12_PLAN.md` "Follow-up:
decklist edit/view UI". Report: `agent-reports/phase-12-decklist-ui.md`.

- **New decklist** on `/decklists` (heading, next to Search).
- Edit uses the same sectioned list as view (hover, `CardReference`, groupings)
  plus qty input, Remove, add-card search. No separate "Remove cards" list.
- Identity title `text-lg` + visible ~120px medium thumbnail on view and edit.
- Quantity before the card name, same size; trailing `xN` removed.
- Save greys when clean, **Saving…** while pending, **Saved** via `?saved=1`.
  No-JS Save stays enabled.

Dirty/pending/Saved and hover interaction still need a browser look.
