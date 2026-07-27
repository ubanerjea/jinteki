# jinteki — Phase 2 Build Plan: NRDB Data Sync

## Context

Phase 1 delivered the foundation (Next.js app, Postgres schema, Auth.js) but the database is empty — there's no actual card/decklist/ruling data yet, which blocks every later phase (browsing UI, search, right-click rulings, favorites) since none of that has anything to display. Phase 2 builds the NRDB sync layer: the scripts that pull cards, factions, packs, decklists, and official rulings from NRDB's API into the schema Phase 1 already migrated.

The rules-doc scraper (`rules.nullsignal.games`) is a genuinely different problem — HTML parsing vs. a JSON API — and is intentionally deferred to Phase 3, not bundled in here. All browsing/search UI, the right-click rulings/rules context menu, and favorites UI remain deferred to phases after that.

## Scope

1. An NRDB API client.
2. Sync scripts, run in dependency order: factions + packs → cards → decklists → rulings.
3. A `SyncRun` log table (new this phase, not in the original schema — see note below) plus an admin-gated trigger surface: CLI scripts, API routes, and a minimal admin page, consistent with the architecture decision that all syncs are manually triggered (CLI + in-app button, no cron).
4. Vitest tests for the NRDB-response → Prisma-row mapping logic, using recorded fixture data — the specific case the project plan called out Vitest for.

## Things to confirm/verify at build time (not hard-coded from memory)

- **Exact NRDB API endpoints and pagination shape.** Confirm the current base URL, endpoint paths, and pagination format against `https://api.netrunnerdb.com/api/docs` when building — APIs drift, and the endpoints referenced during the original architecture interview shouldn't be trusted as current without a live check (the same caution Phase 1 applied to Auth.js env var names).
- **Whether NRDB's decklist endpoint supports filtering by update date.** Recommendation: if it does, sync decklists incrementally (only fetch what changed since the last successful `SyncRun`); if it doesn't, do a full paginated resync each time (still an upsert, so idempotent) and accept that the first run will be slow — NRDB has many thousands of decklists, and the "sync everything" scope decision from the architecture interview means this is expected, not a bug. Either way, this needs deciding once the actual API is in front of you, not guessed now.
- **Rate limiting**: sync scripts should fetch pages sequentially with a modest delay between requests, not hammer NRDB in parallel — no documented rate limit was found during the original research, so be a good citizen by default rather than finding the limit the hard way.

## New schema addition: `SyncRun`

Not part of Phase 1's schema — added here because the admin trigger UI is meaningless without visibility into "did the last sync work, when, how many records." A new migration this phase adds:

```
model SyncRun {
  id          String    @id @default(cuid())
  type        SyncType  // FACTIONS_PACKS | CARDS | DECKLISTS | RULINGS
  status      SyncStatus // RUNNING | SUCCESS | FAILED
  startedAt   DateTime  @default(now())
  finishedAt  DateTime?
  recordCount Int?
  errorMessage String?
}
```

## NRDB API client — `src/lib/nrdb/client.ts`

A thin typed fetch wrapper: base URL, pagination helper (yields pages until exhausted), shared error handling. No auth needed (NRDB's API is public/unauthenticated). Sync modules build on this rather than each hand-rolling fetch logic.

## Sync scripts — `src/sync/`

- `sync-factions-packs.ts` — upserts `Faction` and `Pack` rows. Runs first; `Card` has FK dependencies on both.
- `sync-cards.ts` — upserts `Card` rows (structured columns + full `raw Json`). Depends on factions/packs already existing.
- `sync-decklists.ts` — upserts `Decklist` + `DecklistCard` rows. Depends on `Card` existing (for `identityCode` and `DecklistCard.cardCode` FKs).
- `sync-rulings.ts` — upserts `Ruling` rows. Depends on `Card` existing (for `cardCode` FK).

Each script:
- Is idempotent (upsert on the natural NRDB code/id, safe to re-run).
- Wraps its run in a `SyncRun` row (`RUNNING` → `SUCCESS`/`FAILED`, with `recordCount`/`errorMessage`).
- Is runnable standalone via a `pnpm` script (`pnpm sync:factions`, `pnpm sync:cards`, `pnpm sync:decklists`, `pnpm sync:rulings`), plus `pnpm sync:all` running all four in dependency order.

## Admin trigger surface

- `POST /api/admin/sync/[type]` — gated by Phase 1's `requireAdmin()` (finally wiring it up to something), invokes the matching sync function, returns the resulting `SyncRun`.
- `/admin/sync` page — gated the same way. Lists the four sync types, a "Trigger" button per type, and each type's most recent `SyncRun` (status/timestamp/record count/error). Functional only, no styling polish — that's for the eventual UI phase, not this one.

## Testing

- Vitest unit tests per sync module for the "map one NRDB API object → Prisma create/update input" function — the part most likely to silently break when NRDB's response shape shifts.
- Small recorded JSON fixtures committed under `src/sync/__fixtures__/`, not live network calls in tests.
- A couple of idempotency tests: running a mapper twice on the same fixture produces the same upsert key/values.

## Verification

- Each `pnpm sync:*` script run for real against the live NRDB API, with resulting row counts checked via `psql`.
- `pnpm sync:all` runs the full chain in order without FK violations.
- `pnpm test` passes.
- As the promoted admin user (Phase 1 left this as a manual one-off step — do it before this phase's verification), load `/admin/sync`, trigger each sync via the UI, and confirm the `SyncRun` rows and record counts update correctly.

## Explicitly deferred to later phases (not built now)

- The rules-doc scraper and `RuleSection` population (Phase 3).
- All card/decklist/rules-glossary browsing and search UI (Phase 4+).
- The right-click rulings/rules context menu (depends on both this phase's `Ruling` data and Phase 3's `RuleSection` data — Phase 4/5).
- Favorites UI (Phase 4/5+).

## Roadmap beyond Phase 2 (for visibility only — not detailed/decided yet)

- **Phase 3**: rules-doc scraper (`rules.nullsignal.games` → `RuleSection` rows) and the real curated `RuleMapping` data (replacing Phase 1's two placeholder rows).
- **Phase 4**: card/decklist browsing + Postgres search UI.
- **Phase 5**: rulings/rules-glossary integration (right-click menu), favorites, admin UI polish.
