# Phase 5 report — Rules Glossary UI, Right-Click Integration, Favorites, Admin Polish

Built against `plans/PHASE_5_PLAN.md` in full. All scope items were built; nothing was
descoped. One pre-existing constraint (no browser available) limits how far the
right-click/grid-rendering verification could go — flagged explicitly below, as the
plan requires.

## What was built

### 1. Global nav / auth state (`src/components/site-header.tsx`, `src/app/layout.tsx`)

`SiteHeader` is a server component (calls `auth()` directly, no client-side session
fetch) rendered in `layout.tsx` above `{children}`. Nav links to `/cards`,
`/decklists`, `/rules`; `/favorites` and `/admin` links appear only when signed in /
`role === "ADMIN"` respectively. Signed-out: a "Sign in" link to `/api/auth/signin`.
Signed-in: avatar (hotlinked, same no-`next/image` convention as card images) + name/
email + a "Sign out" button — implemented as an **inline Server Action**
(`<form action={async () => { "use server"; await signOut(...) }}>`), per the plan's
suggestion ("whichever is simpler to wire correctly").

### 2. Rules glossary browsing (`/rules`, `/rules/[id]`)

- `src/lib/search/rule-sections.ts` — `searchRuleSections()`, same
  `Prisma.sql`-only/parameterized pattern as `cards.ts`/`decklists.ts`. One thing not
  anticipated in the plan and confirmed only by checking real data:
  `RuleSection.id` values are dotted section numbers ("1.1", "10.12", ...) that sort
  **wrong** under plain lexicographic `ORDER BY id` (`"10.1" < "1.1"` as text —
  confirmed via `psql` against the real 119-row table). Fixed with
  `ORDER BY string_to_array(id, '.')::int[]`, which casts each id to a Postgres int
  array so comparison is numeric/element-wise; verified directly via `psql` that this
  produces the correct 1.1, 1.2, ..., 1.10, 1.11, ..., 10.1, ... order.
- `src/app/rules/page.tsx` — list/search page, `q` trigram search, reuses
  `PaginationNav`.
- `src/app/rules/[id]/page.tsx` — detail page: title, full `bodyText`, and a link out
  to `https://rules.nullsignal.games/#{anchor}` for the canonical wording (the URL
  constant is duplicated here rather than imported from `src/sync/sync-rules.ts`, to
  avoid pulling that module's `cheerio` scraping dependency into this page's server
  bundle).

### 3. Right-click integration

- `src/lib/rule-section-resolution.ts` — pure `resolveRuleSectionIds(card, mappings)`:
  given a card's `typeCode`/`keywords` and an **already-fetched** array of
  `RuleMapping` rows, returns the deduped list of matching `RuleSection` ids. It does
  not query the DB itself — it has no Prisma import at all. Kept DB-free specifically
  so it's fixture-testable per the plan's Testing section. The DB query that actually
  produces the `RuleMapping` rows this function operates on lives one layer up, in
  `getCardReferenceData` below — see the "Two testing layers" note under Verification
  for how each part is checked.
- **Verified the plan's "confirm before relying on it" claim**: queried the real DB
  directly — every one of the 11 distinct `Card.typeCode` values appears verbatim as a
  `RuleMapping.key`, confirming the shared lowercase/underscore vocabulary still holds
  (see Verification below for the actual query/output).
- `src/app/actions/card-reference.ts` — the Server Action (`getCardReferenceData`):
  looks up the card, fetches its `Ruling` rows, fetches candidate `RuleMapping` rows
  (`key IN [typeCode, ...keywords]`), and hands off to the pure resolver to build the
  final deduped `RuleSection` list.
- `src/components/card-reference.tsx` — the shared `CardReference` client component.
  Hand-rolled context menu (`onContextMenu` + `preventDefault`, fixed-position
  popover, click-outside via a `mousedown` listener, `Escape` via `keydown`) — no menu
  library was needed, confirming the plan's expectation. Calls `getCardReferenceData`
  directly from the client on right-click via `useTransition`. Renders title, facet
  links (faction/type/side/keywords), rulings (with empty state), and linked rule
  sections (with empty state, linking to `/rules/[id]`).
- `src/components/nsg-verified-badge.tsx` — small badge + `title` tooltip explaining
  `Ruling.nsgRulesTeamVerified`, shown next to each verified ruling in the popover.
- `src/components/facet-link.tsx` — turns a faction/type/side/keyword value into a
  link to `/cards?{param}=value`. Used both inside the popover and on the plain-text
  facets on `/cards/[code]` (which were converted from inert `<span>` text to real
  links).
- Wired `CardReference` through **every** place a card is mentioned: `/cards` list
  rows and grid cells, `/cards/[code]`'s own title + image, `/decklists/[id]`'s card
  rows (including the identity line), and `/favorites`' card/decklist-identity rows.

### 4. Favorites

- `src/lib/require-session.ts` — `requireSession()`, the lighter "is *any* user
  signed in" counterpart to `requireAdmin()` the plan asked to add.
- `src/app/actions/favorites.ts` — `toggleCardFavorite`/`toggleDecklistFavorite`
  Server Actions. Deliberately implemented as **real progressive-enhancement forms**
  (`<form action={toggleCardFavorite.bind(null, code)}>` in
  `src/components/favorite-toggle-form.tsx`) rather than client-side `fetch` calls —
  this was a build-time decision beyond what the plan specified, made because it (a)
  works without JS, and (b) turned out to make the write path directly `curl`-testable
  (see Verification: the exact hidden-field encoding Next.js emits was inspected and
  replayed with a real session cookie). Unauthenticated attempts are rejected via
  `redirect("/api/auth/signin")` (a real 303/307, not a silent no-op).
- Toggle buttons wired onto `/cards/[code]` (next to the title) and
  `/decklists/[id]` (next to the header), each showing current favorited state
  (checked server-side per request).
- `src/app/favorites/page.tsx` — signed-in-only (redirects to sign-in otherwise),
  lists the user's `CardFavorite`/`DecklistFavorite` rows, card rows go through
  `CardReference`.

### 5. Admin UI polish

`src/app/admin/sync/page.tsx` and `sync-trigger-button.tsx` restyled with the same
Tailwind conventions as the rest of the app (container width, table borders, a status
badge component with color per `SyncStatus`). No functional change — `requireAdmin()`
gating and the trigger/refresh flow are untouched.

### 6. `/cards` search & browsing enhancements

- `src/lib/search/cards.ts`: added `keyword` (array-containment,
  `${keyword} = ANY("keywords")`, mirrors the faction/side/type pattern exactly) and
  `order` (`title`/`faction`/`type`, additive — absent/unrecognized falls back
  unchanged to the pre-existing similarity-or-title behavior). Also added `raw` to
  `CardSummary`'s SELECT so the grid view can resolve image URLs from data already
  fetched, without a second query per row.
- `src/app/cards/page.tsx`: keyword `<select>` (options populated from a real
  `SELECT DISTINCT unnest(keywords)` query — 104 real values), a sort `<select>`, a
  `view=list|grid` toggle (List/Grid links preserving all other searchParams; grid
  renders `getCardImageUrl(card.raw, "small")` image cells, same hotlink approach as
  the detail page), and a "Random card" link to the new route.
- `src/app/cards/random/route.ts` — `GET` route handler,
  `SELECT code FROM "Card" ORDER BY random() LIMIT 1`, 302s to `/cards/[code]`. Placed
  as a static segment (`cards/random/route.ts`) so it wins over the `[code]` dynamic
  segment.

## Deviations from the plan

- **Favorites as real `<form>` submissions, not `fetch`-based client toggles.** The
  plan said "Server Actions" but left the wiring open. Chose plain progressive-
  enhancement forms specifically because it made the write path independently
  `curl`-verifiable with a real session cookie (see Verification) — matching this
  project's established "verify with real requests" standard better than a
  client-fetch wrapper would have.
- **`RuleSection` natural-sort ordering** (`string_to_array(id,'.')::int[]`) wasn't
  called out in the plan at all — discovered and fixed during the build per the
  "verify at build time" spirit of the plan's own "Things to confirm" section.
- Everything else matches the plan's scope and file/route naming as written.

## Verification

All commands below were actually run this session; output is summarized, not
self-reported.

**Typecheck & lint**
- `npx tsc --noEmit -p tsconfig.json` → exit 0, no errors.
- `npx eslint .` → exit 0, no errors (fixed one `react/no-unescaped-entities` and one
  unused-var warning found on the first pass).

**Tests**
- `npx vitest run` → **10 files, 88 tests, all passing**, including the new
  `rule-section-resolution.test.ts` (fixture-driven, plus a few assertions against
  the real `prisma/rule-mapping-data.ts`), `rule-sections.test.ts` (real DB, incl. the
  natural-sort-order regression test), and the `cards.test.ts` additions for
  `keyword`/`order` (real DB, cross-checked against direct `prisma.card.count`/
  `findMany` calls, not just internal consistency).

  **Two testing layers for rule-section resolution, made explicit here since it
  wasn't clearly stated elsewhere in this report**: `rule-section-resolution.test.ts`
  is fixture-driven and covers exactly one thing — `resolveRuleSectionIds()`'s
  in-memory dedup/filter algorithm. It has no Prisma import and never touches the DB,
  by design. It does **not** exercise the DB query that supplies that function's
  input in production — `prisma.ruleMapping.findMany({ where: { key: { in: [...] } } })`
  inside `getCardReferenceData` (see "What was built" §3 above). That query is
  covered separately, for real, by the "Rule-section resolution spot-checked against
  real data" checks below, which call `getCardReferenceData` end-to-end against real
  card codes. Neither check alone would catch both kinds of bug (a wrong query vs. a
  wrong dedup algorithm) — the fixture tests and the real-data spot-checks are
  complementary, not redundant.

**Dev-mode boot + curl**
`pnpm dev` → `Ready in 332ms`. Real requests against the running server:
- `/`, `/cards`, `/rules`, `/rules/3.5` → 200.
- `/favorites` unauthenticated → 307 to `/api/auth/signin`.
- `/cards/random` → 307 to a real `/cards/[code]` (`/cards/next_wave_2`).
- `/rules/9999` (nonexistent) → 404.
- `/admin/sync` unauthenticated → 200 + "Access denied: Not authenticated"; with the
  real admin session cookie → 200, real sync table.
- Header: unauthenticated shows only "Sign in"; with the admin session cookie shows
  "Sign out", `/admin/sync`, and `/favorites` links.

**Production build + start + curl (separate check)**
- `pnpm build` → compiled successfully, all new routes listed
  (`/rules`, `/rules/[id]`, `/cards/random`, `/favorites`) as dynamic (ƒ).
- `pnpm start` → genuine `next start` (`Ready in 123ms`, no dev banner). Repeated the
  full curl battery above against the production server — identical results,
  including the auth-gated routes (this is the exact check that caught the
  `AUTH_TRUST_HOST` bug in Phase 3, so it was not skipped).

**Schema**: `npx prisma migrate status` → "Database schema is up to date!", 4
migrations, no drift. No schema changes were made this phase (as the plan expected);
this is a real confirmation, not an assumption.

**Rule-section resolution vocabulary check** (the plan's "confirm before relying on
it"):
```
SELECT DISTINCT "typeCode" FROM "Card";      -- 11 rows
SELECT DISTINCT key FROM "RuleMapping";      -- 26 rows, superset of the 11 typeCodes
```
Confirmed every real `typeCode` value appears verbatim as a `RuleMapping.key` — the
shared vocabulary the plan asked to verify still holds.

**Rule-section resolution spot-checked against real data** (calling
`getCardReferenceData` directly, not just asserting from the mapping data):
- `accelerated_diagnostics` (typeCode `operation`) → resolved to `["3.5 Operations"]`,
  matching Phase 3's curated mapping exactly, as the plan's example predicted.
- `botulus` (typeCode `program`, keywords `[trojan, virus]`) → resolved to
  `["3.9 Programs", "1.9 Counters and Tokens"]`; its two real rulings both correctly
  came back with `nsgRulesTeamVerified: true`.
- A nonexistent card code → `{ card: null, rulings: [], ruleSections: [] }`, no crash.

**Keyword filter, sort, `/random` — verified against real data, both dev and prod**:
- `/cards?keyword=virus&pageSize=100`: extracted every `/cards/[code]` link from the
  real rendered HTML and diffed against
  `SELECT code FROM "Card" WHERE 'virus' = ANY(keywords)` — **exact match**, 41 rows,
  in both dev and production mode.
- `/cards?order=faction&pageSize=100`: extracted the ordered sequence of card codes
  from the real rendered HTML and diffed against
  `SELECT code FROM "Card" ORDER BY "factionCode" ASC, title ASC LIMIT 100` —
  **exact match**, in both dev and production mode.
- `/cards/random` → 307 to a real, different `/cards/[code]` on repeated dev/prod
  requests.

**Favorite toggling — real admin session, real row counts, both dev and prod**: the
exact hidden-field encoding Next.js emits for a bound Server Action form
(`$ACTION_REF_n`, `$ACTION_n:0` = `{"id":...,"bound":"$@1"}`, `$ACTION_n:1` = the bound
args array) was read out of the real rendered page HTML and replayed with `curl -F`
against the live server, using the real admin session cookie:
- **Card favorite**: row count 0 → toggle with session cookie → `200`, real
  `CardFavorite` row created (confirmed via `psql`) → toggle again → `200`, row
  deleted (back to 0, confirmed via `psql`).
- **Decklist favorite**: same create/delete cycle confirmed via `psql` against
  `DecklistFavorite`, and the created row correctly appeared on `/favorites`.
- **Unauthenticated toggle attempt** (same form fields, no cookie): `303 See Other` →
  `Location: /api/auth/signin`, and `psql` confirmed **no row was created** — a real
  rejection, not just gating code that exists but was never exercised.
- All of the above was repeated identically under `pnpm start` (production), not only
  `pnpm dev`.
- Did **not** exercise the sign-out form for real (it would have deleted the only real
  session token available for the rest of this verification pass, per the "don't
  fabricate credentials" constraint) — its presence/structure in the rendered HTML was
  confirmed instead, and it's an unmodified use of Auth.js's own `signOut()`, already
  proven end-to-end in Phase 1/3.

**Known, inherent limitation (as the plan requires calling out plainly)**: the actual
right-click mouse interaction and popover positioning/rendering, and the grid view's
visual layout, require a real browser with JS execution, which isn't available in this
environment. Everything upstream of that was verified for real as detailed above (the
Server Action's data-fetching/resolution logic with real card codes, the grid view's
server-rendered HTML actually containing correct
`https://card-images.netrunnerdb.com/...` URLs — spot-checked directly). The
click-to-popover UX and the grid layout's actual on-screen appearance need the repo
owner's manual confirmation in a browser.

Port 3000 was freed at the end (both the dev and prod server processes started during
this session were killed).

## Unresolved / follow-ups

- Right-click popover UX and grid-view visual layout need manual browser confirmation
  (see limitation above) — no action needed unless something looks wrong.
- Row-level (list-view) favorite toggling remains explicitly deferred, per the plan.
- Two untracked files appeared in `git status` that this session did not create —
  `agent-reports/netrunner-new-player-faq.md` and
  `agent-reports/netrunner-play-patterns.md`. Left untouched (out of this phase's
  scope); worth the repo owner's attention since they weren't mentioned in this
  phase's briefing.
- Deployment/hosting (next on the roadmap per the plan) was not started — out of
  scope for this phase.
