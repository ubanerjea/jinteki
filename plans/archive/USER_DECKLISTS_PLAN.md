# jinteki — User Decklists

Archived after Phase 12 shipped. Build spec remains `plans/PHASE_12_PLAN.md`
(section 2). Phase 12 corrects the identity select:
`typeCode IN ('corp_identity', 'runner_identity')`, not `'identity'`.

## Context

`PROJECT_PLAN.md`'s Users & Auth section already ships **favorites** (bookmark a public
card or NRDB-synced decklist) and explicitly deferred **user-created decklists**. This
plan is that deferred piece, scoped to one question: a signed-in user can collect
decklists on their profile — ones they like while browsing, and ones they make —
and those they own stay private unless they opt in to publish.

What already exists and must not be rebuilt:

- `DecklistFavorite` + `toggleDecklistFavorite` on `/decklists/[id]`
  (`src/app/actions/favorites.ts`, `src/components/favorite-toggle-form.tsx`).
- `/favorites` listing those bookmarks (`src/app/favorites/page.tsx`).
- The same `Decklist` / `DecklistCard` row shape the NRDB sync writes, rendered by
  `/decklists/[id]`.

NRDB-synced lists are already public (that's the dataset `/decklists` is). Privacy
applies to **user-owned** rows, not to hiding NRDB data.

## Two collections, not one

| Collection | What it is | Visibility |
|---|---|---|
| **Favorited** | Pointer at an existing public `Decklist` (NRDB or a published user list). Unchanged Phase 5 toggle. | The list itself stays public. The fact *you* favorited it stays on your profile (the existing `/decklists?tab=favorited` tab still counts public favorites only). |
| **Owned** | A `Decklist` row with `ownerId = you`. Created blank, or cloned from a list you were browsing. | **Private by default.** Public only if you tick publish. Private rows never appear in `/decklists` or `/decklists/advanced`, and `/decklists/[id]` 404s for anyone who is not the owner (including signed-out). |

"Save while browsing" is therefore two buttons on `/decklists/[id]`, not a new
concept: **Favorite** (already there) and **Save a copy to my decks** (new — clones
into an owned private row and redirects to it). Unsigned clicks of either redirect
to sign-in, same as `toggleDecklistFavorite` today.

## Schema

Same `Decklist` table. A second table would duplicate `DecklistCard`, the detail
page, and search. NRDB ids are UUIDs (`91383315-750e-49e5-91a6-6e280bf02fc0` in
`src/sync/__fixtures__/decklist.json`); user ids use `@default(cuid())`, which
does not collide with that namespace. Sync upserts by the NRDB id it fetched, so
it cannot clobber a cuid row.

Add to `Decklist`:

- `ownerId String?` — FK to `User.id`, `onDelete: Cascade`. Null means NRDB-synced.
- `isPublic Boolean @default(true)` — existing ~74k rows stay public without a
  data backfill. User-create/clone actions **always pass `isPublic: false`**
  unless the publish checkbox is on; the column default is a safety net for NRDB
  rows, not the user-facing default.
- `notes String?` — user-authored plain text. NRDB notes stay in `raw` and keep
  going through `plainTextFromNotes`. The detail page prefers `notes` when set,
  else the existing raw path.
- `id` gains `@default(cuid())` so creates need not invent an id. Sync still
  passes the NRDB UUID explicitly.

`createdAt` / `updatedAt` already exist and are nullable. Owned creates set both
to now; edits bump `updatedAt`. `raw` stays required; owned rows store `{}`.

`User` gains the reverse `ownedDecklists Decklist[]`. Index `ownerId`.

Migration must not drop the five `pg_trgm` GIN indexes (standing schema hazard in
`schema.prisma`'s header). After migrate, regenerate `docs/schema.md` via
`pnpm docs:schema`.

Confirm at build time, do not hard-code: identity cards are `Card.typeCode =
'identity'` (synced from NRDB `card_type_id` in `sync-cards.ts`). Query
`SELECT DISTINCT "typeCode" FROM "Card"` before wiring the identity `<select>`.

## Visibility — one helper, every public query

A small helper (e.g. `src/lib/decklist-visibility.ts`):

- `publicDecklistSql()` → `d."isPublic" = true` (covers NRDB rows and opted-in
  owned rows; private owned rows are `false`).
- `canViewDecklist(decklist, userId)` → `isPublic || ownerId === userId`.

Wire `publicDecklistSql()` into **every** listing that is not the owner's own
profile:

- `searchDecklistsByTab` in `src/lib/search/decklists.ts` (all four tabs,
  including the favorited join — a private deck must not rank there).
- `searchDecklistsAdvanced` in `src/lib/search/decklists-advanced.ts` (push onto
  `conditions` so it is present even when no other facet is set; today's
  no-filter query is `WHERE`-less and would otherwise leak).

`/decklists/[id]`: 404 when `!canViewDecklist`. Do not 403 — existence of a
private id is not public information. Skip the NRDB "View on NetrunnerDB" link
and `nrdbUserId` byline on owned rows; show the jinteki owner's `User.name`
instead. Owner sees Edit / Delete / publish-state.

Sync (`src/sync/sync-decklists.ts`) is unchanged in behavior (it only upserts
the UUID it fetched). Add a comment that any future wipe-all **must** exclude
`ownerId IS NOT NULL`. Do not add a wipe.

## Profile — `/me`

Signed-in only (redirect to `/api/auth/signin`, same as `/favorites`).

Two decklist sections plus the existing favorited-cards list:

1. **My decklists** — `Decklist` where `ownerId = session.user.id`, newest
   `updatedAt` first. Each row: name, identity, Private/Public badge, links to
   view and edit. Empty state names the New button. A **New decklist** link.
2. **Favorited decklists** — existing `DecklistFavorite` query.
3. **Favorited cards** — existing `CardFavorite` query.

`/favorites` **redirects to `/me`** so the header link and any bookmarks keep
working. Header: the username (currently inert text in `site-header.tsx`) links
to `/me`; the Favorites nav item can stay (it now lands on `/me`) or be relabeled
"My decks" — one of those, not a third destination.

No `/users/[id]` public profile. Publishing means "this row is eligible for
`/decklists` browse/search", not "other people get a page of everything I've
made."

## Create, clone, edit

Plain Server Actions bound to HTML forms, same progressive-enhancement style as
`favorites.ts`. Gated with `requireSession()`; unauthenticated → sign-in
redirect. `revalidatePath` the owned id, `/me`, and `/decklists` (so a publish
lands on Recent).

| Action | Behavior |
|---|---|
| `createDecklist` | Name + required identity. `ownerId = me`, `isPublic = false`, empty `raw`, `createdAt`/`updatedAt` now. Also writes the identity as a `DecklistCard` qty 1 (NRDB's own `card_slots` include the identity; `/decklists/[id]` already filters it out of the displayed list). Redirect to `/decklists/{id}/edit`. |
| `cloneDecklist` | From a viewable source id. New cuid row, `ownerId = me`, `isPublic = false`, name `Copy of {source.name}`, same identity/slots/notes. Redirect to the copy's detail page. Refuse if the source is not viewable by this user. |
| `updateDecklist` | Owner only. Name, notes, identity, `isPublic`, and the slot list (cardCode + quantity). Replace-all-slots in one transaction, same pattern as `syncOneDecklist`. |
| `addDecklistCard` / `removeDecklistCard` | Owner only. Add is upsert-by-`(decklistId, cardCode)` (bump or insert). Quantity must be an integer ≥ 1. Unknown `cardCode` is rejected against `Card.code`, not stored as a dangling FK wait. |
| `deleteDecklist` | Owner only. `prisma.decklist.delete` (cards and favorites cascade). Redirect to `/me`. Refuse to delete `ownerId IS NULL` rows. |

Routes:

| Route | Job |
|---|---|
| `/decklists/new` | Signed-in form: name, identity `<select>` (every `typeCode = 'identity'` card, title + faction). POST `createDecklist`. Static `new` segment, sibling of `[id]`, so it is not captured as an id. |
| `/decklists/[id]/edit` | Owner only; anyone else 404. Name, notes `<textarea>`, identity select, publish checkbox, current slots (qty input + Remove per row), and an **add-card** search: GET `q` on this same page, `searchCards({ q, pageSize: 20 })`, each hit an Add form (hidden `cardCode`, qty default 1). Save metadata is one form; slot add/remove are separate POSTs that re-render. No client-side deckbuilder. |
| `/decklists/[id]` | View, plus Favorite and (if signed in) Save a copy. Owner also gets Edit / Delete / a Private badge. |

Do **not** block save on influence, agenda points, minimum deck size, or 3-of.
`/decklists/[id]` already *displays* influence / agenda / count; keep that as
information. Enforcing deck-wide legality is still the thing `PHASE_8_PLAN.md`
deferred.

## Testing

Real DB, no mocks, matching `decklists.test.ts` / `favorites` conventions.

- Visibility helper: public → anyone; private + matching owner → yes; private +
  other/null user → no.
- `searchDecklistsByTab` / `searchDecklistsAdvanced` with one private owned row
  inserted: public totals equal the pre-insert count; the private id is absent
  from items. Flip `isPublic` true → it appears (Recent, and an unfiltered
  advanced query).
- Clone: new row, different id, `ownerId` set, `isPublic = false`, slot set
  equal to source (query `DecklistCard` both sides).
- Update/delete refuse when `ownerId` is some other user or null.
- Existing `decklists.test.ts` / `decklists-advanced.test.ts` stay green — they
  count today's NRDB rows, which remain `isPublic = true`.

## Verification

`PROJECT_PLAN.md` phase standards: typecheck/lint, `pnpm test`, dev boot + curl,
**separate** `next build` + `next start` + curl (this plan adds auth-gated
routes). Plus:

- **GIN indexes still present** after the migration (`pg_indexes` contains
  `Decklist_name_trgm_idx` and the other four `trgm_idx` names). Direct
  introspection, not Prisma's success message.
- **Public listing count unchanged** by the migration itself: `SELECT count(*)
  FROM "Decklist" WHERE "isPublic"` equals `SELECT count(*) FROM "Decklist"`
  immediately after migrate (every existing row defaulted true). Re-check the
  live `/decklists` total against that number.
- **Unauthenticated `GET /decklists/{privateId}` → 404** (create a private row
  with `psql`/`prisma` for the check, then curl with no cookie). Same id with
  the owner's session cookie → 200 and the name. A non-owner session → 404.
- **Unsigned POST** of clone/create/update → redirect to sign-in, no new row
  (`SELECT count(*) FROM "Decklist" WHERE "ownerId" IS NOT NULL` unchanged).
- **Create via the real form POST** with a session cookie: one new row,
  `ownerId` = that user, `isPublic = false`, identity slot present. Then
  `GET /decklists` HTML does not contain that name; `GET /me` does.
- **Publish**: POST update with the checkbox on, then the name appears in
  `GET /decklists` (Recent). Uncheck, it disappears again.
- **Clone** of a known public NRDB id (use a real synced UUID): second row,
  cuid id, same `identityCode`, same `DecklistCard` cardinality as the source.
- **Sync does not eat owned rows**: after an owned create, `pnpm sync:decklists`
  (incremental is enough) leaves that row in place.

No headless browser here. Form POSTs are curl-able; hover/layout of the edit
page still needs a human look. Say so in the task report.

## Deliberately not built

- A visual/live deckbuilder (search-as-you-type tray, drag-drop, running
  influence/agenda/legality as a save gate, card-draw simulator, export
  formats). The edit page is a form.
- Row-level favorite/clone buttons on `/decklists` list rows (still the Phase 5
  deferral). Detail page is enough.
- Public `/users/[id]` profiles, comments, likes-as-popularity, fork lineage.
- Publishing to NRDB, or treating jinteki `User` as `Decklist.nrdbUserId`.
- Making favorited-NRDB-lists themselves private (they are not yours to unpublish).
- Changing how favorites work, or folding Favorite and Save-a-copy into one button.
- Deck-wide MWL/points-budget legality (`PHASE_8_PLAN.md`).
- Anything deployment/hosting-related.
