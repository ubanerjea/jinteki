# Phase 12 build notes

Implementation of `plans/PHASE_12_PLAN.md`. This is the build subagent's notes, not the consolidated `agent-reports/phase-12.md` (that waits on independent verification).

## What was built

### Section 1 — simple search syntax

- `src/lib/search/query-syntax.ts` — operator registry (longest-prefix), tokenizer, recursive-descent parser, AST. No npm parser library. Empty `and`/`or` as the whole query is residual text. Unmatched parens and dangling `&`/`|` compile to match-none.
- `src/lib/search/cards.ts` — `extractOperators()` removed. `parseCardSearchParams()` keeps raw trimmed `q` and reads URL `banned` (`1`/`0`). `searchCards()` compiles the AST and ANDs it with `buildFacetConditions()` of URL facets only. URL facets win over the same field in `q`. Ranking uses `GREATEST` of AST text-term `word_similarity`s; facet-only queries stay `title ASC` unless `order=` is set. Shared `validBanned()` / `bannedCondition()` lifted for both engines.
- `src/lib/search/cards-advanced.ts` — uses the shared banned helper.
- `src/lib/search/prefix-options.ts` — formats, packs, cycles, banned yes/no added. Cap still 8 at the box.
- `src/components/simple-search-box.tsx` — completable short and long forms; `valueStart = start + prefix.length + 1`; optional `!`; trailing-space `f: ana` still completes. `i:`/`title:`/`x:`/`text:` stay null.
- `src/lib/search/filter-summary.ts` — `banned` added to `FACET_PARAMS`.
- `src/app/cards/syntax/page.tsx` — rewritten for what this phase ships. Worked counts re-derived live (Anarch 253, virus keyword 41, Standard pool 613, banned 29 / legal 584, Kala Ghoda 19, Mumbad 114, title virus 3, text virus 78). First-wins revoked; `i:` ≠ illustrator; `&`/`|` need spaces; "there is no `b:`" deleted.
- `src/app/cards/page.tsx` — comments updated; box still shows raw `q`. Home-page hint `f:anarch virus` unchanged.

Tests: `query-syntax.test.ts`; real-DB cases in `cards.test.ts` (format/banned/set/cycle/OR/negation/title vs text); `simple-search-box.test.ts` long-form and new prefixes.

### Section 2 — user decklists

- `prisma/schema.prisma` — `Decklist.ownerId` (FK User, Cascade), `isPublic @default(true)`, `notes`, `id @default(cuid())`, `User.ownedDecklists`, index on `ownerId`.
- Migration `20260906161416_add_decklist_owner` — generated SQL inspected before apply: no GIN-index DROPs. After apply: all five `trgm_idx` indexes still present; `SELECT count(*) FROM "Decklist" WHERE "isPublic"` = `SELECT count(*) FROM "Decklist"` = 74242.
- `src/lib/decklist-visibility.ts` — `publicDecklistSql()`, `canViewDecklist()`.
- Wired into `searchDecklistsByTab` (all four tabs, including favorited) and `searchDecklistsAdvanced` (always pushed onto `conditions`).
- `src/lib/identity-cards.ts` — live `DISTINCT typeCode` is still only `corp_identity` (81) + `runner_identity` (67) = 148. No `identity` typeCode.
- `src/lib/owned-decklists.ts` — create/clone/update/add/remove/delete with owner checks. Create/clone always `isPublic: false`. Clone notes: `source.notes` if set, else `plainTextFromNotes` of source raw. Owned `raw` is `{}`.
- `src/app/actions/decklists.ts` — Server Actions, `requireSession` → sign-in redirect, `revalidatePath` of the id, `/me`, `/decklists`.
- `src/app/actions/favorites.ts` — also `revalidatePath("/me")`; favoriting a private list is refused (unfavorite still works).
- Routes: `/me`, `/favorites` → `/me`, `/decklists/new`, `/decklists/[id]/edit`. Header username and Favorites nav both go to `/me` (label stays Favorites).
- `/decklists/[id]` — 404 when `!canViewDecklist`; owned rows skip NRDB byline/link and show `User.name`; owner gets Edit / Delete / Private-Public; Favorite + Save a copy.
- `src/sync/sync-decklists.ts` — comment that any future wipe-all must exclude `ownerId IS NOT NULL`. No wipe added.

### Section 3 — decklist card hover

- `src/components/card-hover-image.tsx` — mouse-only (`pointerType === "mouse"`), mount img on first hover, `z-40`, 300px, `getCardImageUrl(..., "large")`, plain `<img>` with the existing eslint-disable + hotlink comment. `src={null}` → children only. Positioning extracted as `computeHoverPosition` and unit-tested.
- Used only from `/decklists/[id]`, wrapping identity and every slot as specified (hover wraps `CardReference`, not a prop on it). List layout unchanged.

## Deviations

1. **`id` default is Prisma-client `cuid()`, not a Postgres DEFAULT.** `\d` / `information_schema.columns` shows `id` with no `column_default`. That is how Prisma implements `@default(cuid())`. Creates via Prisma Client do not pass an id (verified in `owned-decklists.test.ts`). Sync still passes the NRDB UUID.
2. **Mutation logic lives in `src/lib/owned-decklists.ts`**, with Server Actions as session/redirect/revalidate wrappers. The plan named the actions; tests cannot call `redirect`/`requireSession` without mocks, which this repo forbids, so the permission and slot logic is in a lib the actions call.
3. **Existing decklist search tests now compare against `isPublic: true` counts** (and the format/rotation oracles add `d."isPublic" = true`). Totals are unchanged today because every NRDB row defaulted public; the predicate is what search actually uses once private rows exist.

No other intentional scope cuts. Out-of-scope items (visual deckbuilder, hover elsewhere, npm parser, etc.) were not built.

## Commands and results

| Command | Result |
|---|---|
| Parser / type-ahead / filter-summary unit tests | 58 passed |
| `pnpm exec prisma migrate dev --name add_decklist_owner --create-only` | `prisma/migrations/20260906161416_add_decklist_owner/migration.sql` — ALTER ADD COLUMN isPublic/notes/ownerId, index, FK. **No GIN DROPs.** |
| `pnpm exec prisma migrate deploy` + `prisma generate` | Applied; client generated |
| `pnpm docs:schema` | `docs/schema.md` shows ownerId / isPublic / notes / `id` default cuid() |
| `pnpm exec tsc --noEmit` | clean |
| `pnpm lint` | clean |
| `pnpm test` | **398 passed** (30 files) |
| psql: five `trgm_idx` names | all present |
| psql: public count vs total after migrate | 74242 = 74242 |

`pnpm dev` / production `next build` + curl were left for the independent verify agent.

## Unfinished / verify-agent notes

- Hover mouse enter/leave, flip-to-left, stacking under CardReference, and touch-does-not-stick need a real browser. Same caveat CardReference has carried since Phase 5. Unit tests cover only `computeHoverPosition`.
- Type-ahead dropdown UX also needs a browser; unit tests cover token detection / splice / valueStart.
- Form POST with a session cookie (create/publish/clone) and unauthenticated 404/redirect curls are listed in the plan's Verification section and were not run here.
- `Decklist.id` has no SQL DEFAULT; confirm via Prisma schema / Client creates, not `column_default`.
- Identity `typeCode` re-checked live: still only `corp_identity` and `runner_identity` (148).
