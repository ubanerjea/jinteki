# jinteki — Phase 5 Build Plan: Rules Glossary UI, Right-Click Integration, Favorites, Admin Polish

## Context

Phase 4 built the browsing/search core for cards and decklists. Phase 5 is the last phase on the roadmap `PHASE_2_PLAN.md` originally laid out, and it completes the "core loop" `PROJECT_PLAN.md`'s Deployment section names as the trigger for revisiting hosting: rules-glossary browsing, the right-click rulings/rules integration that was the very first feature described in the original architecture interview ("right-click an Operation → what is an Operation?"), favorites (the reason accounts exist at all, per `PROJECT_PLAN.md`'s Users & Auth section), and finally styling the admin sync page, which has been "functional only" since Phase 2.

This phase also closes a real gap Phase 4 didn't need to touch: **there is currently no sign-in/sign-out control anywhere in the app's UI.** Every verification so far has signed in manually via `/api/auth/signin` or tested authenticated routes with a session token pulled directly from the database. Favorites can't be a real feature without a way for a user to actually discover and trigger sign-in from within the app.

`agent-reports/scryfall-ux-research.md` (a research pass on Scryfall, a comparable card-database product for Magic: The Gathering) surfaced a handful of small, self-contained `/cards` search/browsing improvements — folded into this phase's scope below rather than run as a separate step, since they're small enough to ride along with the other UI work already planned here.

## Scope

1. A persistent header/nav (in `layout.tsx`) with links to Cards/Decklists/Rules, sign-in/sign-out reflecting real session state, and an Admin link visible only to admins.
2. Rules glossary browsing: `/rules` (list/search, reusing Phase 4's search-layer pattern) and `/rules/[id]` (detail page).
3. Right-click integration: a shared component wrapping every place a card is referenced (list rows, detail pages) that intercepts right-click and shows the card's official rulings plus its linked rule section(s), resolved via the `RuleMapping` data Phase 3 curated specifically for this, plus clickable facet links and an NSG-verified explainer (see below).
4. Favorites: toggle buttons on card/decklist detail pages, backed by the `CardFavorite`/`DecklistFavorite` tables that have existed since Phase 1, plus a `/favorites` page listing a signed-in user's favorites.
5. Admin UI polish: real styling on `/admin/sync`, consistent with the rest of the app.
6. Extend Phase 4's `src/lib/search/` with `searchRuleSections`, following the same pattern as `searchCards`/`searchDecklists`.
7. `/cards` search/browsing enhancements from the Scryfall research: a `keywords` filter, an explicit sort control, a grid/list view toggle, and a `/random` card route (see dedicated section below).

## Things to confirm/verify at build time (not hard-coded from memory)

- **Rule-section resolution for a given card**: a card's relevant sections come from `RuleMapping` rows matching either its `typeCode` or any of its `keywords` (Phase 3's report confirms `RuleMappingEntry.key` uses the same lowercase/underscore vocabulary as `Card.typeCode`/`Card.keywords`, specifically so this phase could join directly without a translation layer — verify that's actually still true against the real data before relying on it). A card can match multiple `RuleMapping` rows (its type plus one or more keywords); dedupe by `RuleSection.id` before displaying, since a type and a keyword could both resolve to the same section.
- **Context menu mechanics**: this app has avoided adding UI-component dependencies so far (Tailwind only, no component library). A hand-rolled client component (`onContextMenu` + `preventDefault`, fixed-position popover, click-outside-to-close, Escape-to-close) is almost certainly sufficient for this — confirm that's true before reaching for a menu library; only add one if the hand-rolled version turns out to be genuinely awkward (real accessibility/focus-trap problems), not by default.
- **Session-check helper for favorites**: Phase 1's `requireAdmin()` is admin-specific. Favorites need "is *any* user signed in," not "is this user an admin" — check whether a lighter helper already exists or needs adding (a thin wrapper around `auth()` returning the session or throwing/redirecting), rather than misusing `requireAdmin()` for a non-admin-gated feature.

## Global navigation & auth state

- `src/app/layout.tsx` gains a shared header (server component, reads `auth()` directly — no need for client-side session fetching): nav links to `/cards`, `/decklists`, `/rules`; on the right, either "Sign in" (linking to `/api/auth/signin`) or the signed-in user's name/avatar plus a sign-out control (Auth.js's `signOut()` server action, or a plain form posting to the built-in sign-out route — whichever is simpler to wire correctly). An "Admin" link appears only when `session.user.role === "ADMIN"`.

## `/cards` search & browsing enhancements (from Scryfall UX research)

Small, self-contained additions to `src/app/cards/page.tsx` and `src/lib/search/cards.ts`, per `agent-reports/scryfall-ux-research.md`'s "quick wins" — each is a `searchParams`-driven addition consistent with the existing "URL is the source of truth" pattern from Phase 4, no new dependency or infrastructure:

- **Keywords filter**: `Card.keywords` (`String[]`) already exists and is already displayed on the detail page, but isn't filterable on `/cards` today. Add a `keyword` `searchParams` value to the existing filter form, and an array-containment clause (`${keyword} = ANY("keywords")`) to `searchCards()`, mirroring the existing `faction`/`side`/`type` equality-filter pattern exactly.
- **Explicit sort control**: `searchCards`/`searchDecklists` currently hard-code their ordering. Add an `order` `searchParams` value (e.g. `title`, `faction`, `type`) with a small `<select>` in the existing `<form method="get">`, defaulting to current behavior so this is additive, not a breaking change.
- **Grid/list view toggle**: `/cards` is currently a plain text `<ul>`. Add a `view` `searchParams` value (`grid` | `list`, defaulting to `list` to match current behavior) that renders the same `searchCards()` result set as a `<div className="grid ...">` of card-image cells (using `getCardImageUrl()`'s small/tiny size, same hotlink-no-`next/image` approach as the detail page) instead of the text list. Purely a rendering-mode toggle on data already fetched — no new query.
- **`/random` route**: a route that redirects to a random `Card.code`'s detail page. Simple and cheap at 2054 rows (`ORDER BY random() LIMIT 1`, or a cheaper random-offset approach if that turns out to matter in practice).

## Rules glossary browsing

- `/rules` — paginated list/search (`q` trigram search across `title`+`bodyText`, reusing Phase 4's `PaginationNav` and `searchParams`-driven pattern exactly). No structured filters needed (unlike cards' faction/side/type) — the rules doc doesn't have equivalent facets.
- `/rules/[id]` — detail page: title, full `bodyText`, and (since the scrape captured `anchor`) a link out to the live `rules.nullsignal.games` page for that section, for anyone who wants the canonical/most-current wording.

## Right-click rulings/rules integration

- A shared component (e.g. `src/components/card-reference.tsx`) that every card mention in the app renders through — `/cards` list rows, `/cards/[code]`'s own title/image, `/decklists/[id]`'s card list rows, and the new `/favorites` page's card rows. One implementation, not duplicated per page, mirroring how Phase 4 centralized search logic instead of inlining it per page.
- On right-click: prevent the default browser context menu, show a small popover at the cursor position with (a) the card's title, (b) its official rulings (from `Ruling`, joined on `cardCode` — Phase 2 data), (c) its linked rule section(s) (resolved via `RuleMapping` as described above, showing section title + enough of `bodyText` to be useful, linking to the full `/rules/[id]` page). Empty states (no rulings, no mapped section) should say so plainly rather than showing nothing with no explanation.
- **Clickable facet links** (from the Scryfall research's "browse by facet" pattern): the card's faction/type/side/keyword values shown in the popover (and the plain-text ones already on `/cards/[code]`) link to `/cards?faction=X` / `/cards?type=Y` / `/cards?keyword=Z` (the last using the keywords filter added above) instead of being inert text — a lightweight substitute for a dedicated "related cards" feature, essentially free to add while this component is being built regardless.
- **NSG-verified explainer**: `Ruling.nsgRulesTeamVerified` is a boolean that's existed in the schema since Phase 1 but has never been surfaced in any UI. Show it as a small badge next to each ruling in the popover (e.g. "NSG-verified") with a one-line tooltip/link explaining what that means, mirroring Scryfall's pattern of a short explainer next to any status a casual user wouldn't otherwise intuit.
- Data fetching: a Server Action (idiomatic for this Next.js version, avoids adding a new REST endpoint for what's fundamentally a read triggered by a client interaction) that takes a card code and returns its rulings + resolved rule sections.

## Favorites

- `CardFavorite`/`DecklistFavorite` toggle buttons on `/cards/[code]` and `/decklists/[id]` (Server Actions, gated by the session-check helper from above — reject/redirect if not signed in).
- `/favorites` — signed-in-only page (redirect to sign-in if not authenticated) listing the user's favorited cards and decklists, each linking to its detail page, reusing `CardReference` for the card rows so right-click still works there too.
- List-view (row-level) quick-favorite buttons on `/cards`/`/decklists` are explicitly **not** required this phase — detail-page-only toggling is sufficient to make the feature real and usable; row-level toggling can follow later if it turns out to matter.

## Admin UI polish

- Restyle `/admin/sync` with the same Tailwind conventions as the rest of the app (the existing functionality — trigger buttons, `SyncRun` table — doesn't need to change, just look consistent with everything else built since).

## Search query layer extension

- `src/lib/search/rule-sections.ts` — `searchRuleSections(params)`, following `cards.ts`/`decklists.ts`'s exact pattern (parameterized `Prisma.sql` trigram query, `PagedResult<T>`, reuses `pagination.ts`). Same hard requirement as Phase 4: no `$queryRawUnsafe`, no string-concatenated user input in SQL.

## Testing

- Vitest tests for `searchRuleSections` (same shape as Phase 4's `cards.test.ts`/`decklists.test.ts` — real DB, since it's testing real trigram ranking).
- Vitest tests for the rule-section-resolution-for-a-card logic (given a card's `typeCode`/`keywords` and an already-fetched set of `RuleMapping` rows, returns the correct deduped `RuleSection` set) — this is a good candidate for a pure, fixture-driven test rather than needing the full Server Action wired up. **Scope note**: this only covers the in-memory dedup/filter algorithm. It does not exercise the DB query that supplies those `RuleMapping` rows in production (`prisma.ruleMapping.findMany({ where: { key: { in: [...] } } })`, inside the Server Action) — a fixture can't catch a bug in that query itself (wrong filter, missing `include`, etc.), so that query needs its own real-DB verification, separate from these fixture tests (see Verification section).
- Vitest tests (extending `cards.test.ts`) for the new `keyword` filter and `order` sort param on `searchCards()` — same real-DB approach as the existing tests.

## Verification

Follow `PROJECT_PLAN.md`'s "Phase verification standards" in full (typecheck/lint, dev-mode boot+curl, production `build`+`start`+curl as a separate check, schema changes — none expected this phase, but confirm via `prisma migrate status` — verified by direct introspection if any turn out to be needed, data-writing logic — favorite toggles — verified by real row counts, auth-gated routes checked with real requests, tests passing). Phase-specific additions:

- Favorite toggling verified with the real admin session (same technique used since Phase 1: pull a valid `sessionToken` from the `Session` table, use it as a cookie in direct requests) — confirm a toggle actually creates/removes the expected `CardFavorite`/`DecklistFavorite` row, and confirm an unauthenticated toggle attempt is rejected.
- Rule-section resolution spot-checked against real data for a few concrete cards (e.g. an Operation card should surface §3.5, matching Phase 3's curated mapping) — checked directly (calling the resolution function/Server Action with a real card code), not just assumed from the mapping data existing.
- Keyword filter, sort, and `/random` verified with real curl requests against real data (e.g. `/cards?keyword=virus` returns only cards with `virus` in `keywords`, `/cards?order=faction` actually changes result order, `/random` 302s to a real `/cards/[code]`) — not just "compiles and renders."
- **Known, inherent limitation, same as every prior phase's OAuth caveat**: the actual right-click interaction (mouse event, popover rendering/positioning) and the grid/list toggle's visual rendering require a real browser with JS execution, which isn't available for automated verification in this environment. Verify everything upstream for real (the Server Action's data-fetching logic, correct rulings/section resolution for real cards, the grid view's HTML actually containing the right image URLs) and say plainly that the click-to-popover UX and grid layout need the repo owner's manual confirmation in a browser — don't claim either "works" without that caveat.

## Explicitly deferred to later phases (not built now)

- User-created decklists / a full deckbuilder (explicitly out of scope per `PROJECT_PLAN.md`'s Users & Auth section, not just deferred within this roadmap).
- Row-level (list-view) favorite toggling.
- Any deployment/hosting work — still local-only per `PROJECT_PLAN.md`, to be revisited once this phase makes the core loop solid.

## Roadmap beyond Phase 5 (for visibility only — not detailed/decided yet)

With Phase 5 complete, the "core loop" `PROJECT_PLAN.md` describes (browse/search cards & decklists, rulings, rules glossary, favorites) is done. The natural next major decision is deployment (`PROJECT_PLAN.md`'s Deployment section explicitly defers this until now) — not detailed here, since it involves real decisions (hosting provider, production OAuth app, hosted Postgres) that deserve their own discussion rather than being assumed.
